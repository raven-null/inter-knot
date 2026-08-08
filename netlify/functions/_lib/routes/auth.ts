/** 认证相关路由：登录 / 注册 / 找回 / 续期 / 当前用户（基于 Blobs）
 *
 * 注册/找回验证码流程的安全设计参考自 InterKnot-server（Strapi）：
 * - 6 位数字验证码，10 分钟有效，发送冷却 60s，最多尝试 5 次
 * - 验证码以 HMAC-SHA256 哈希存储（不落明文）
 * - 发送找回验证码不暴露邮箱是否注册（防枚举）
 * - 注册前校验站点设置 allowRegister
 * 未接入邮件服务时由 BYPASS_EMAIL_CODE 宽松校验（任意 6 位数字即可）。
 */

import { genId, getJson, setJson, del, userKey, userEmailKey, codeKey, KEYS } from "../storage";
import { createHmac, randomInt } from "node:crypto";
import { bumpStats } from "../feed";
import { hashPassword, verifyPassword, signToken, verifyToken, getBearerToken, requireAuth } from "../auth";
import { json, ok, badRequest, unauthorized, error, readJson } from "../http";
import { toAuthor, type Doc } from "../serialize";
import { ensureSeed } from "../seed";

const BYPASS_CODE = process.env.BYPASS_EMAIL_CODE !== "false";
const CODE_TTL_SECONDS = 10 * 60;
const SEND_COOLDOWN_SECONDS = 60;
const MAX_VERIFY_ATTEMPTS = 5;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_PATTERN = /^\d{6}$/;

function codeSecret(): string {
  return process.env.REGISTER_CODE_SECRET || process.env.JWT_SECRET || "dev-only-change-me";
}

function codeHash(email: string, code: string): string {
  return createHmac("sha256", codeSecret()).update(`${email}:${code}`).digest("hex");
}

function generateCode(): string {
  return String(randomInt(0, 1000000)).padStart(6, "0");
}

function emailOf(input: unknown): string {
  return String(input || "").trim().toLowerCase();
}

async function findUserByEmail(email: string): Promise<Doc | null> {
  const idx = await getJson<{ document_id: string }>(userEmailKey(email));
  if (!idx) return null;
  return getJson<Doc>(userKey(idx.document_id));
}

async function siteSettings(): Promise<Doc> {
  return (await getJson<Doc>(KEYS.settings)) ?? {};
}

/** 距离可再次发送的秒数（冷却期内 > 0） */
async function cooldownRemaining(email: string, purpose: string): Promise<number> {
  const rec = await getJson<{ sent_at?: string }>(codeKey(purpose, email));
  if (!rec?.sent_at) return 0;
  const elapsed = (Date.now() - new Date(rec.sent_at).getTime()) / 1000;
  return Math.max(0, Math.ceil(SEND_COOLDOWN_SECONDS - elapsed));
}

async function issueVerificationCode(email: string, purpose: string): Promise<void> {
  const now = new Date();
  const code = generateCode();
  await setJson(codeKey(purpose, email), {
    purpose,
    code_hash: codeHash(email, code),
    expires_at: new Date(now.getTime() + CODE_TTL_SECONDS * 1000).toISOString(),
    sent_at: now.toISOString(),
    attempts: 0,
  });
}

/** 校验并消费验证码；失败时返回 attemptsRemaining（便于前端展示剩余次数） */
async function verifyAndConsume(
  email: string,
  purpose: string,
  code: string,
): Promise<{ ok: boolean; attemptsRemaining?: number }> {
  const rec = await getJson<{ code_hash?: string; expires_at?: string; attempts?: number }>(codeKey(purpose, email));
  if (!rec) return { ok: false };

  if (rec.expires_at && new Date(rec.expires_at).getTime() <= Date.now()) {
    await del(codeKey(purpose, email));
    return { ok: false };
  }

  const attempts = Number(rec.attempts || 0);
  if (attempts >= MAX_VERIFY_ATTEMPTS) {
    await del(codeKey(purpose, email));
    return { ok: false };
  }

  const valid = BYPASS_CODE
    ? CODE_PATTERN.test(code) // 宽松模式：任意 6 位数字
    : rec.code_hash === codeHash(email, code);

  if (!valid) {
    const next = attempts + 1;
    if (next >= MAX_VERIFY_ATTEMPTS) await del(codeKey(purpose, email));
    else await setJson(codeKey(purpose, email), { ...rec, attempts: next });
    return { ok: false, attemptsRemaining: Math.max(0, MAX_VERIFY_ATTEMPTS - next) };
  }

  await del(codeKey(purpose, email));
  return { ok: true };
}

export async function login(req: Request): Promise<Response> {
  const { identifier, password } = await readJson<{ identifier?: string; password?: string }>(req);
  const email = emailOf(identifier);
  if (!email || !password) return badRequest("请输入邮箱和密码");
  const user = await findUserByEmail(email);
  if (!user || !user.password_hash) return unauthorized("邮箱或密码错误");
  const okPass = await verifyPassword(password, String(user.password_hash));
  if (!okPass) return unauthorized("邮箱或密码错误");
  if (user.status !== "active") return error(403, "账号已被禁用", "USER_BLOCKED");
  const token = await signToken({
    documentId: String(user.document_id),
    username: String(user.username),
    role: String(user.role || "user"),
  });
  return json({ jwt: token, user: toAuthor(user) });
}

export async function sendRegisterCode(req: Request): Promise<Response> {
  const { email } = await readJson<{ email?: string }>(req);
  const e = emailOf(email);
  if (e.length < 6 || !EMAIL_PATTERN.test(e)) return badRequest("邮箱格式不正确", "INVALID_EMAIL");

  const settings = await siteSettings();
  if (settings.allowRegister === false) return error(403, "当前不允许注册", "REGISTER_DISABLED");
  if (await findUserByEmail(e)) return badRequest("该邮箱已注册", "EMAIL_TAKEN");

  const wait = await cooldownRemaining(e, "register");
  if (wait > 0) return error(429, "验证码发送过于频繁，请稍后再试", "REGISTER_CODE_COOLDOWN", { retryAfter: wait });

  await issueVerificationCode(e, "register");
  return json({ email: e, sent: true, expiresIn: CODE_TTL_SECONDS, cooldown: SEND_COOLDOWN_SECONDS });
}

export async function registerWithCode(req: Request): Promise<Response> {
  const { email, code, password } = await readJson<{ email?: string; code?: string; password?: string }>(req);
  const e = emailOf(email);
  const c = String(code || "").trim();
  if (!e || !c) return badRequest("请填写邮箱与验证码");
  if (!CODE_PATTERN.test(c)) return badRequest("验证码必须是 6 位数字", "INVALID_VERIFICATION_CODE");
  if (!password || password.length < 6) return badRequest("密码至少 6 位", "INVALID_PASSWORD");

  const settings = await siteSettings();
  if (settings.allowRegister === false) return error(403, "当前不允许注册", "REGISTER_DISABLED");
  if (await findUserByEmail(e)) return badRequest("该邮箱已注册", "EMAIL_TAKEN");

  const verify = await verifyAndConsume(e, "register", c);
  if (!verify.ok) {
    return error(400, "验证码错误或已过期", "REGISTER_CODE_INVALID", {
      attemptsRemaining: verify.attemptsRemaining,
    });
  }

  const username = `用户${genId().slice(0, 6)}`;
  const documentId = genId();
  const passHash = await hashPassword(password);
  const now = new Date().toISOString();
  const user = {
    document_id: documentId,
    username,
    name: username,
    email: e,
    password_hash: passHash,
    avatar_url: "/images/default-avatar.webp",
    bio: "",
    level: 1,
    exp: 0,
    role: "user",
    status: "active",
    profile_hidden: false,
    created_at: now,
    stats: { articleCount: 0, commentCount: 0, totalViews: 0, totalLikes: 0, totalComments: 0 },
    followersCount: 0,
    followingCount: 0,
  };
  await setJson(userKey(documentId), user);
  await setJson(userEmailKey(e), { document_id: documentId });
  await bumpStats({ userCount: 1 });
  const token = await signToken({ documentId, username, role: "user" });
  return json({ jwt: token, user: toAuthor(user) });
}

export async function sendResetCode(req: Request): Promise<Response> {
  const { email } = await readJson<{ email?: string }>(req);
  const e = emailOf(email);
  if (!e) return badRequest("请输入邮箱");

  const wait = await cooldownRemaining(e, "reset");
  if (wait > 0) return error(429, "验证码发送过于频繁，请稍后再试", "RESET_CODE_COOLDOWN", { retryAfter: wait });

  // 防枚举：无论邮箱是否注册都返回相同响应
  if (await findUserByEmail(e)) await issueVerificationCode(e, "reset");
  return json({ email: e, sent: true, expiresIn: CODE_TTL_SECONDS, cooldown: SEND_COOLDOWN_SECONDS });
}

export async function resetPassword(req: Request): Promise<Response> {
  const { email, code, password } = await readJson<{ email?: string; code?: string; password?: string }>(req);
  const e = emailOf(email);
  const c = String(code || "").trim();
  if (!e || !c) return badRequest("请填写邮箱与验证码");
  if (!CODE_PATTERN.test(c)) return badRequest("验证码必须是 6 位数字", "INVALID_VERIFICATION_CODE");
  if (!password || password.length < 6) return badRequest("密码至少 6 位", "INVALID_PASSWORD");

  const user = await findUserByEmail(e);
  if (!user) return badRequest("验证码无效或已过期");

  const verify = await verifyAndConsume(e, "reset", c);
  if (!verify.ok) {
    return error(400, "验证码错误或已过期", "REGISTER_CODE_INVALID", {
      attemptsRemaining: verify.attemptsRemaining,
    });
  }

  const passHash = await hashPassword(password);
  await setJson(userKey(String(user.document_id)), { ...user, password_hash: passHash });
  return json({ success: true });
}

export async function renew(req: Request): Promise<Response> {
  const token = getBearerToken(req);
  if (!token) return unauthorized();
  const payload = await verifyToken(token);
  if (!payload) return unauthorized();
  const user = await getJson<Doc>(userKey(payload.documentId));
  if (!user || user.status !== "active") return unauthorized();
  const jwt = await signToken({
    documentId: String(user.document_id),
    username: String(user.username),
    role: String(user.role || "user"),
  });
  return json({ jwt });
}

export async function meProfile(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const user = await getJson<Doc>(userKey(viewer.userId));
  if (!user) return unauthorized();
  const author = toAuthor(user) || {};
  return json({
    ...author,
    profileHidden: user.profile_hidden === true,
    examPassed: true,
    isAdmin: viewer.isAdmin,
  });
}

export async function ensureInitialSeed(req: Request): Promise<Response> {
  await ensureSeed();
  return ok({ seeded: true });
}
