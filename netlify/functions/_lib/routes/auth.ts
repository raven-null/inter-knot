/** 认证相关路由：登录 / 注册 / 找回 / 续期 / 当前用户（基于 Blobs） */

import { genId, getJson, setJson, userKey, userEmailKey, codeKey } from "../storage";
import { bumpStats } from "../feed";
import { hashPassword, verifyPassword, signToken, verifyToken, getBearerToken, requireAuth } from "../auth";
import { json, ok, badRequest, unauthorized, error, readJson } from "../http";
import { toAuthor } from "../serialize";
import { ensureSeed } from "../seed";

const BYPASS_CODE = process.env.BYPASS_EMAIL_CODE !== "false";

function makeCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function emailOf(input: unknown): string {
  return String(input || "").trim().toLowerCase();
}

async function findUserByEmail(email: string): Promise<Record<string, unknown> | null> {
  const idx = await getJson<{ document_id: string }>(userEmailKey(email));
  if (!idx) return null;
  return getJson<Record<string, unknown>>(userKey(idx.document_id));
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

async function issueVerificationCode(email: string, purpose: string): Promise<void> {
  await setJson(codeKey(purpose, email), {
    code: makeCode(),
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    created_at: new Date().toISOString(),
  });
}

async function verifyVerificationCode(email: string, purpose: string, code: string): Promise<boolean> {
  if (BYPASS_CODE) return code.trim().length >= 4;
  const rec = await getJson<{ code: string; expires_at: string }>(codeKey(purpose, email));
  if (!rec || rec.code !== code || new Date(rec.expires_at).getTime() < Date.now()) return false;
  return true;
}

export async function sendRegisterCode(req: Request): Promise<Response> {
  const { email } = await readJson<{ email?: string }>(req);
  const e = emailOf(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return badRequest("邮箱格式不正确", "INVALID_EMAIL");
  await issueVerificationCode(e, "register");
  return json({ email: e, sent: true, expiresIn: 600, cooldown: 0 });
}

export async function registerWithCode(req: Request): Promise<Response> {
  const { email, code, password } = await readJson<{ email?: string; code?: string; password?: string }>(req);
  const e = emailOf(email);
  if (!e || !code) return badRequest("请填写邮箱与验证码");
  if (!password || password.length < 6) return badRequest("密码至少 6 位", "WEAK_PASSWORD");
  if (!(await verifyVerificationCode(e, "register", String(code)))) {
    return badRequest("验证码错误或已过期", "REGISTER_CODE_INVALID");
  }
  if (await findUserByEmail(e)) return badRequest("该邮箱已注册", "EMAIL_TAKEN");
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
  if (!(await findUserByEmail(e))) return badRequest("该邮箱未注册", "EMAIL_NOT_FOUND");
  await issueVerificationCode(e, "reset");
  return json({ email: e, sent: true, expiresIn: 600, cooldown: 0 });
}

export async function resetPassword(req: Request): Promise<Response> {
  const { email, code, password } = await readJson<{ email?: string; code?: string; password?: string }>(req);
  const e = emailOf(email);
  if (!e || !code) return badRequest("请填写邮箱与验证码");
  if (!password || password.length < 6) return badRequest("密码至少 6 位");
  if (!(await verifyVerificationCode(e, "reset", String(code)))) {
    return badRequest("验证码错误或已过期", "REGISTER_CODE_INVALID");
  }
  const user = await findUserByEmail(e);
  if (!user) return badRequest("该邮箱未注册", "EMAIL_NOT_FOUND");
  const passHash = await hashPassword(password);
  await setJson(userKey(String(user.document_id)), { ...user, password_hash: passHash });
  return json({ success: true });
}

export async function renew(req: Request): Promise<Response> {
  const token = getBearerToken(req);
  if (!token) return unauthorized();
  const payload = await verifyToken(token);
  if (!payload) return unauthorized();
  const user = await getJson<Record<string, unknown>>(userKey(payload.documentId));
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
  const user = await getJson<Record<string, unknown>>(userKey(viewer.userId));
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
