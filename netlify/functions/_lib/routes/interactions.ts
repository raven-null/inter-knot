/** 互动路由：点赞 / 收藏 / 关注 / 拉黑 / 举报 / 作者搜索（基于 Netlify Blobs） */

import { getJson, setJson, del, exists, listKeys, postKey, likeKey, favoriteKey, followKey, blockKey, reportKey, KEYS } from "../storage";
import { feedUpdate, getUser, updateUserCounts } from "../feed";
import { requireAuth } from "../auth";
import { ok, json, badRequest, notFound, int, readJson, queryParams } from "../http";
import { DEFAULT_AVATAR, type Doc } from "../serialize";

async function touchArticleCount(postId: string, patch: Doc): Promise<void> {
  const doc = await getJson<Doc>(postKey(postId));
  if (!doc) return;
  await setJson(postKey(postId), { ...doc, ...patch });
  await feedUpdate(postId, patch);
}

async function touchCommentCount(commentId: string, delta: number): Promise<void> {
  const lookup = await getJson<{ key: string }>(KEYS.commentLookup(commentId));
  if (!lookup) return;
  const doc = await getJson<Doc>(lookup.key);
  if (!doc) return;
  await setJson(lookup.key, { ...doc, likes_count: Math.max(0, Number(doc.likes_count || 0) + delta) });
}

// ── 点赞 ───────────────────────────────────────────────
export async function toggleLike(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const { targetType, targetId } = await readJson<{ targetType?: string; targetId?: string }>(req);
  if (!targetType || !targetId) return badRequest("缺少参数");

  const key = likeKey(viewer.userId, targetType, targetId);
  const liked = await exists(key);
  if (liked) {
    await del(key);
    if (targetType === "article") {
      const doc = await getJson<Doc>(postKey(targetId));
      await touchArticleCount(targetId, { likes_count: Math.max(0, Number(doc?.likes_count || 0) - 1) });
      const fresh = await getJson<Doc>(postKey(targetId));
      return json({ liked: false, likesCount: Number(fresh?.likes_count || 0) });
    }
    await touchCommentCount(targetId, -1);
    return json({ liked: false, likesCount: 0 });
  }

  await setJson(key, { created_at: new Date().toISOString() });
  if (targetType === "article") {
    const doc = await getJson<Doc>(postKey(targetId));
    await touchArticleCount(targetId, { likes_count: Number(doc?.likes_count || 0) + 1 });
    const fresh = await getJson<Doc>(postKey(targetId));
    return json({ liked: true, likesCount: Number(fresh?.likes_count || 0) });
  }
  await touchCommentCount(targetId, 1);
  return json({ liked: true, likesCount: 1 });
}

export async function checkLikes(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const qp = queryParams(req);
  const targetType = qp.get("targetType") || "article";
  const ids = (qp.get("targetIds") || "").split(",").filter(Boolean);
  const flags = await Promise.all(ids.map((id) => exists(likeKey(viewer.userId, targetType, id))));
  const result: Record<string, boolean> = {};
  ids.forEach((id, i) => (result[id] = flags[i]));
  return ok(result);
}

// ── 收藏 ───────────────────────────────────────────────
export async function toggleFavorite(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const { targetId } = await readJson<{ targetId?: string }>(req);
  if (!targetId) return badRequest("缺少参数");
  const doc = await getJson<Doc>(postKey(targetId));
  if (!doc) return notFound("帖子不存在");

  const key = favoriteKey(viewer.userId, targetId);
  const favorited = await exists(key);
  if (favorited) {
    await del(key);
    await touchArticleCount(targetId, { favorites_count: Math.max(0, Number(doc.favorites_count || 0) - 1) });
  } else {
    await setJson(key, { created_at: new Date().toISOString() });
    await touchArticleCount(targetId, { favorites_count: Number(doc.favorites_count || 0) + 1 });
  }
  const fresh = await getJson<Doc>(postKey(targetId));
  return json({ favorited: !favorited, favoritesCount: Number(fresh?.favorites_count || 0) });
}

export async function checkFavorites(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const ids = (queryParams(req).get("targetIds") || "").split(",").filter(Boolean);
  const flags = await Promise.all(ids.map((id) => exists(favoriteKey(viewer.userId, id))));
  const result: Record<string, boolean> = {};
  ids.forEach((id, i) => (result[id] = flags[i]));
  return ok(result);
}

// ── 关注 ───────────────────────────────────────────────
export async function toggleFollow(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const { authorDocumentId } = await readJson<{ authorDocumentId?: string }>(req);
  if (!authorDocumentId) return badRequest("缺少参数");
  if (authorDocumentId === viewer.userId) return badRequest("不能关注自己");
  const target = await getUser(authorDocumentId);
  if (!target) return notFound("用户不存在");

  const key = followKey(viewer.userId, authorDocumentId);
  const following = await exists(key);
  if (following) {
    await del(key);
    await updateUserCounts(authorDocumentId, { followersCount: -1 });
    await updateUserCounts(viewer.userId, { followingCount: -1 });
  } else {
    await setJson(key, { created_at: new Date().toISOString() });
    await updateUserCounts(authorDocumentId, { followersCount: 1 });
    await updateUserCounts(viewer.userId, { followingCount: 1 });
  }
  const fresh = await getUser(authorDocumentId);
  return json({ following: !following, followersCount: Number(fresh?.followersCount || 0) });
}

export async function checkFollows(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const ids = (queryParams(req).get("authorIds") || "").split(",").filter(Boolean);
  const flags = await Promise.all(ids.map((id) => exists(followKey(viewer.userId, id))));
  const result: Record<string, boolean> = {};
  ids.forEach((id, i) => (result[id] = flags[i]));
  return ok(result);
}

// ── 拉黑 ───────────────────────────────────────────────
export async function toggleUserBlock(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const { authorDocumentId } = await readJson<{ authorDocumentId?: string }>(req);
  if (!authorDocumentId) return badRequest("缺少参数");
  if (authorDocumentId === viewer.userId) return badRequest("不能拉黑自己");
  if (!(await getUser(authorDocumentId))) return notFound("用户不存在");

  const key = blockKey(viewer.userId, authorDocumentId);
  const blocked = await exists(key);
  if (blocked) await del(key);
  else await setJson(key, { created_at: new Date().toISOString() });
  return json({ blocked: !blocked, authorDocumentId });
}

export async function checkUserBlocks(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const ids = (queryParams(req).get("authorIds") || "").split(",").filter(Boolean);
  const flags = await Promise.all(ids.map((id) => exists(blockKey(viewer.userId, id))));
  const result: Record<string, boolean> = {};
  ids.forEach((id, i) => (result[id] = flags[i]));
  return ok(result);
}

export async function myBlockedList(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const qp = queryParams(req);
  const start = Math.max(0, int(qp.get("start")));
  const limit = Math.min(50, Math.max(1, int(qp.get("limit"), 20)));
  const keys = await listKeys(`user_blocks/${viewer.userId}/`);
  const blockedIds = keys.map((k) => k.split("/")[2].replace(/\.json$/, "")).filter(Boolean);
  const users: Doc[] = [];
  for (const id of blockedIds) {
    const u = await getUser(id);
    if (u) users.push(u);
  }
  users.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  const page = users.slice(start, start + limit);
  return ok(
    page.map((u) => ({
      documentId: String(u.document_id),
      name: String(u.name || u.username || ""),
      username: String(u.username || ""),
      level: Number(u.level || 1),
      avatar: String(u.avatar_url || DEFAULT_AVATAR),
      createdAt: String(u.created_at || ""),
    })),
  );
}

// ── 举报 ───────────────────────────────────────────────
export async function createReport(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const { targetType, targetId, reason, detail } = await readJson<{ targetType?: string; targetId?: string; reason?: string; detail?: string }>(req);
  if (!targetType || !targetId || !reason) return badRequest("缺少参数");
  const documentId = crypto.randomUUID();
  await setJson(reportKey(viewer.userId, targetType, targetId), {
    document_id: documentId,
    reporter_id: viewer.userId,
    target_type: targetType,
    target_id: targetId,
    reason,
    detail: detail || null,
    status: "open",
    created_at: new Date().toISOString(),
  });
  return ok({ documentId });
}

export async function checkReports(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const qp = queryParams(req);
  const targetType = qp.get("targetType") || "article";
  const ids = (qp.get("targetIds") || "").split(",").filter(Boolean);
  const flags = await Promise.all(ids.map((id) => exists(reportKey(viewer.userId, targetType, id))));
  const result: Record<string, boolean> = {};
  ids.forEach((id, i) => (result[id] = flags[i]));
  return ok(result);
}

// ── 作者搜索（@ 提及） ───────────────────────────────
export async function searchAuthors(req: Request): Promise<Response> {
  const qp = queryParams(req);
  const q = (qp.get("q") || "").trim().toLowerCase();
  const limit = Math.min(20, Math.max(1, int(qp.get("limit"), 8)));
  if (!q) return ok([]);
  const keys = await listKeys("users/");
  const result: Doc[] = [];
  for (const key of keys) {
    if (key.includes("/by-email/")) continue;
    const u = await getJson<Doc>(key);
    if (!u) continue;
    const name = String(u.name || u.username || "");
    if (String(u.username || "").toLowerCase().includes(q) || name.toLowerCase().includes(q)) {
      result.push({
        documentId: String(u.document_id),
        name,
        username: String(u.username || ""),
        level: Number(u.level || 1),
        avatar: String(u.avatar_url || DEFAULT_AVATAR),
      });
    }
    if (result.length >= limit) break;
  }
  return ok(result);
}
