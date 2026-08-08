/** 「我的」个人设置 / 上传库 / 邮箱 / 安全等路由 */

import { db } from "../db";
import { requireAuth } from "../auth";
import { ok, json, badRequest, readJson, int } from "../http";
import { toUploadedFile } from "../serialize";

export async function updateName(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const { name } = await readJson<{ name?: string }>(req);
  const clean = String(name || "").trim().slice(0, 24);
  if (!clean) return badRequest("昵称不能为空");
  await db().sql`UPDATE users SET name = ${clean} WHERE id = ${viewer.userId}`;
  return json({ name: clean });
}

export async function updateBio(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const { bio } = await readJson<{ bio?: string }>(req);
  const clean = String(bio || "").trim().slice(0, 300);
  await db().sql`UPDATE users SET bio = ${clean} WHERE id = ${viewer.userId}`;
  return json({ bio: clean });
}

export async function updateVisibility(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const { profileHidden } = await readJson<{ profileHidden?: boolean }>(req);
  await db().sql`UPDATE users SET profile_hidden = ${profileHidden === true} WHERE id = ${viewer.userId}`;
  return json({ profileHidden: profileHidden === true });
}

export async function security(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const rows = await db().sql`SELECT email, password_hash FROM users WHERE id = ${viewer.userId}`;
  const row = rows[0] as Record<string, unknown> | undefined;
  return json({
    email: row?.email ? String(row.email) : "",
    provider: row?.email ? "local" : "mihoyo",
    hasBoundEmail: Boolean(row?.email),
    hasPassword: Boolean(row?.password_hash),
  });
}

export async function sendBindEmailCode(req: Request): Promise<Response> {
  const { email } = await readJson<{ email?: string }>(req);
  const e = String(email || "").trim().toLowerCase();
  if (!e) return badRequest("请输入邮箱");
  return json({ email: e, sent: true, expiresIn: 600, cooldown: 0 });
}

export async function bindEmail(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const { email } = await readJson<{ email?: string }>(req);
  const e = String(email || "").trim().toLowerCase();
  if (!e) return badRequest("请输入邮箱");
  await db().sql`UPDATE users SET email = ${e} WHERE id = ${viewer.userId}`;
  return json({ email: e, provider: "local", hasBoundEmail: true, hasPassword: true });
}

export async function uploads(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const u = new URL(req.url);
  const page = Math.max(1, int(u.searchParams.get("page"), 1));
  const pageSize = Math.min(60, Math.max(1, int(u.searchParams.get("pageSize"), 24)));
  const offset = (page - 1) * pageSize;
  const total = await db().sql`SELECT count(*)::int AS total FROM uploads WHERE owner_id = ${viewer.userId}`;
  const rows = await db().sql`
    SELECT * FROM uploads WHERE owner_id = ${viewer.userId}
    ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}
  `;
  const totalCount = Number((total[0] as { total: number }).total);
  return json({
    data: rows.map((r) => toUploadedFile(r as never)),
    meta: {
      pagination: { page, pageSize, total: totalCount, pageCount: Math.ceil(totalCount / pageSize) },
    },
  });
}

export async function deleteUpload(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const documentId = decodeURIComponent(req.url.split("?")[0]!.split("/").filter(Boolean).pop() || "");
  const rows = await db().sql`SELECT id, url FROM uploads WHERE document_id = ${documentId} AND owner_id = ${viewer.userId}`;
  if (rows.length === 0) return ok({ deleted: false, inUse: false });
  const url = String((rows[0] as { url: string }).url);
  await db().sql`DELETE FROM uploads WHERE id = ${Number((rows[0] as { id: number }).id)}`;
  try {
    const { getStore } = await import("@netlify/blobs");
    const store = getStore("uploads");
    const key = url.split("/").pop();
    if (key) await store.delete(key);
  } catch {
    // 忽略清理失败
  }
  return ok({ deleted: true, inUse: false });
}

// ── 名片 / 头像（简化实现） ──────────────────────────
export async function businessCards(): Promise<Response> {
  return json({ data: [], equippedCardDocumentId: null, equippedCard: null });
}

export async function equipBusinessCard(): Promise<Response> {
  return json({ success: true });
}

export async function avatars(): Promise<Response> {
  return json({ data: [], equippedAvatarDocumentId: null });
}

export async function equipAvatar(): Promise<Response> {
  return json({ success: true });
}

export async function uploadCustomAvatar(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const { fileId } = await readJson<{ fileId?: number }>(req);
  if (!fileId) return badRequest("缺少文件");
  const rows = await db().sql`SELECT url FROM uploads WHERE id = ${Number(fileId)} AND owner_id = ${viewer.userId}`;
  if (rows.length === 0) return badRequest("文件不存在");
  const url = String((rows[0] as { url: string }).url);
  await db().sql`UPDATE users SET avatar_url = ${url} WHERE id = ${viewer.userId}`;
  return json({ avatar: { url } });
}

// ── 精选委托（简化：返回空） ─────────────────────────
export async function pinnedArticles(): Promise<Response> {
  return json({ pinned: null, candidates: [], max: 6 });
}

export async function updatePinnedArticles(req: Request): Promise<Response> {
  const { pinned } = await readJson<{ pinned?: string[] | null }>(req);
  return json({ pinned: Array.isArray(pinned) ? pinned : null });
}

// ── 每日经验（简化） ─────────────────────────────────
export async function dailyExp(): Promise<Response> {
  return json({
    todaySelfGained: 0,
    todaySelfCap: 50,
    sources: {
      checkIn: { done: false, exp: 10 },
      createArticle: { done: false, exp: 20 },
      createComment: { done: false, exp: 10 },
      likeGive: { done: false, exp: 5 },
    },
  });
}
