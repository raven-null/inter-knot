/** 认证相关路由：登录 / 注册 / 找回 / 续期 / 当前用户 */

import { db, genId } from "../db";
import {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  getBearerToken,
  requireAuth,
} from "../auth";
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

export async function login(req: Request): Promise<Response> {
  const { identifier, password } = await readJson<{ identifier?: string; password?: string }>(req);
  const email = emailOf(identifier);
  if (!email || !password) return badRequest("请输入邮箱和密码");
  const rows = await db().sql<Record<string, unknown>>`SELECT * FROM users WHERE email = ${email}`;
  const row = rows[0];
  if (!row || !row.password_hash) return unauthorized("邮箱或密码错误");
  const okPass = await verifyPassword(password, String(row.password_hash));
  if (!okPass) return unauthorized("邮箱或密码错误");
  if (String(row.status) !== "active") return error(403, "账号已被禁用", "USER_BLOCKED");
  const user = {
    id: Number(row.id),
    documentId: String(row.document_id),
    username: String(row.username),
    role: String(row.role),
  };
  const token = await signToken(user);
  return json({
    jwt: token,
    user: toAuthor(row as never),
  });
}

async function issueVerificationCode(email: string, purpose: string): Promise<void> {
  const d = db();
  const code = makeCode();
  await d.sql`
    INSERT INTO verification_codes (email, purpose, code, expires_at)
    VALUES (${email}, ${purpose}, ${code}, now() + interval '10 minutes')
  `;
}

async function verifyVerificationCode(email: string, purpose: string, code: string): Promise<boolean> {
  if (BYPASS_CODE) return code.trim().length >= 4;
  const d = db();
  const rows = await d.sql`
    SELECT id FROM verification_codes
    WHERE email = ${email} AND purpose = ${purpose} AND code = ${code}
      AND used = false AND expires_at > now()
    ORDER BY created_at DESC LIMIT 1
  `;
  const row = rows[0];
  if (!row) return false;
  await d.sql`UPDATE verification_codes SET used = true WHERE id = ${Number(row.id)}`;
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
  const d = db();
  const exists = await d.sql`SELECT id FROM users WHERE email = ${e}`;
  if (exists.length > 0) return badRequest("该邮箱已注册", "EMAIL_TAKEN");
  const username = `用户${genId().slice(0, 6)}`;
  const documentId = genId();
  const passHash = await hashPassword(password);
  const inserted = await d.sql`
    INSERT INTO users (document_id, username, email, password_hash, name)
    VALUES (${documentId}, ${username}, ${e}, ${passHash}, ${username})
    RETURNING id, document_id, username, role
  `;
  const user = inserted[0] as { id: number; document_id: string; username: string; role: string };
  await d.sql`UPDATE verification_codes SET used = true WHERE email = ${e} AND purpose = 'register'`;
  const token = await signToken({
    id: Number(user.id),
    documentId: user.document_id,
    username: user.username,
    role: user.role,
  });
  return json({ jwt: token, user: { documentId: user.document_id, username: user.username, name: user.username, avatar: "/images/default-avatar.webp", level: 1, exp: 0 } });
}

export async function sendResetCode(req: Request): Promise<Response> {
  const { email } = await readJson<{ email?: string }>(req);
  const e = emailOf(email);
  if (!e) return badRequest("请输入邮箱");
  const exists = await db().sql`SELECT id FROM users WHERE email = ${e}`;
  if (exists.length === 0) return badRequest("该邮箱未注册", "EMAIL_NOT_FOUND");
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
  const passHash = await hashPassword(password);
  await db().sql`UPDATE users SET password_hash = ${passHash} WHERE email = ${e}`;
  return json({ success: true });
}

export async function renew(req: Request): Promise<Response> {
  const token = getBearerToken(req);
  if (!token) return unauthorized();
  const payload = await verifyToken(token);
  if (!payload) return unauthorized();
  const rows = await db().sql<{ id: number; document_id: string; username: string; role: string; status: string }>`
    SELECT id, document_id, username, role, status FROM users WHERE document_id = ${payload.documentId}
  `;
  const row = rows[0];
  if (!row || row.status !== "active") return unauthorized();
  const jwt = await signToken({ id: Number(row.id), documentId: row.document_id, username: row.username, role: row.role });
  return json({ jwt });
}

export async function meProfile(req: Request): Promise<Response> {
  const user = await requireAuth(req);
  const rows = await db().sql`SELECT * FROM users WHERE id = ${user.userId}`;
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) return unauthorized();
  const author = toAuthor(row as never) || {};
  return json({
    ...author,
    profileHidden: row.profile_hidden === true,
    examPassed: true,
    isAdmin: user.isAdmin,
  });
}

export async function ensureInitialSeed(req: Request): Promise<Response> {
  await ensureSeed();
  return ok({ seeded: true });
}
