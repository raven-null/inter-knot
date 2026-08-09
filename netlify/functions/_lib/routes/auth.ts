/** 认证相关路由：米游社扫码登录 / 密钥登录 / 续期 / 当前用户（基于 Blobs）
 *
 * 登录方式：
 * - 米游社扫码：首次登录唯一入口，登录后自动生成 secret_key
 * - 密钥登录：使用米游社登录时生成的 secret_key 直接登录
 *
 * 已移除邮箱登录 / 注册 / 密码找回 / GitHub OAuth（简化认证流程）。
 */

import { genId, getJson, setJson, del, userKey, userUidKey, KEYS } from "../storage";
import { bumpStats } from "../feed";
import { generateUid } from "../uid";
import { hashPassword, signToken, verifyToken, getBearerToken, requireAuth } from "../auth";
import { json, ok, badRequest, unauthorized, readJson } from "../http";
import { toAuthor, type Doc } from "../serialize";
import { ensureSeed } from "../seed";

/** 生成随机密钥（16 位 base62，约 95 bit 熵） */
export function genSecretKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let value = 0n;
  for (const b of bytes) value = value * 256n + BigInt(b);
  let out = "";
  while (value > 0n && out.length < 16) {
    out = alphabet[Number(value % 62n)] + out;
    value = value / 62n;
  }
  while (out.length < 16) out = "a" + out;
  return out;
}

async function findUserByKey(key: string): Promise<Doc | null> {
  const idx = await getJson<{ document_id?: string }>(`users/by-key/${key}.json`);
  if (!idx?.document_id) return null;
  return getJson<Doc>(userKey(idx.document_id));
}

/** POST /api/auth/login-by-key —— 使用密钥登录（米游社登录后生成的 secret_key） */
export async function loginByKey(req: Request): Promise<Response> {
  const { key } = await readJson<{ key?: string }>(req);
  if (!key) return badRequest("请输入密钥");
  const user = await findUserByKey(String(key).trim());
  if (!user || user.status !== "active") return unauthorized("密钥无效或账号已禁用");
  const jwt = await signToken({
    documentId: String(user.document_id),
    username: String(user.username),
    role: String(user.role || "user"),
  });
  return json({ jwt, user: toAuthor(user) });
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
    isAdmin: viewer.isAdmin,
    // 包含 secret_key 供前端展示/复制
    secretKey: user.secret_key ? String(user.secret_key) : null,
    // 打开帖子时自动静音播放视频（默认开启）
    videoAutoplayMuted: user.video_autoplay_muted !== false,
  });
}

export async function ensureInitialSeed(req: Request): Promise<Response> {
  await ensureSeed();
  return ok({ seeded: true });
}
