/** 互动路由：点赞 / 收藏 / 关注 / 拉黑 / 举报 / 作者搜索 */

import { db } from "../db";
import { requireAuth } from "../auth";
import { ok, json, badRequest, notFound, int, readJson, queryParams } from "../http";
import { DEFAULT_AVATAR } from "../serialize";

async function resolveTarget(targetType: string, targetId: string): Promise<number | null> {
  const d = db();
  if (targetType === "article") {
    const rows = await d.sql`SELECT id FROM posts WHERE document_id = ${targetId}`;
    return rows.length ? Number((rows[0] as { id: number }).id) : null;
  }
  if (targetType === "comment") {
    const rows = await d.sql`SELECT id FROM comments WHERE document_id = ${targetId}`;
    return rows.length ? Number((rows[0] as { id: number }).id) : null;
  }
  return null;
}

// ── 点赞 ───────────────────────────────────────────────
export async function toggleLike(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const { targetType, targetId } = await readJson<{ targetType?: string; targetId?: string }>(req);
  if (!targetType || !targetId) return badRequest("缺少参数");
  const internalId = await resolveTarget(targetType, targetId);
  if (!internalId) return notFound();
  const d = db();
  const existing = await d.sql`
    SELECT id FROM likes WHERE user_id = ${viewer.userId} AND target_type = ${targetType} AND target_id = ${internalId}
  `;
  let liked: boolean;
  if (existing.length > 0) {
    await d.sql`DELETE FROM likes WHERE id = ${Number((existing[0] as { id: number }).id)}`;
    liked = false;
  } else {
    await d.sql`INSERT INTO likes (user_id, target_type, target_id) VALUES (${viewer.userId}, ${targetType}, ${internalId})`;
    liked = true;
  }
  if (targetType === "article") {
    await d.sql`UPDATE posts SET likes_count = (SELECT count(*) FROM likes WHERE target_type = 'article' AND target_id = ${internalId}) WHERE id = ${internalId}`;
    const rows = await d.sql`SELECT likes_count FROM posts WHERE id = ${internalId}`;
    return json({ liked, likesCount: Number((rows[0] as { likes_count: number }).likes_count) });
  }
  await d.sql`UPDATE comments SET likes_count = (SELECT count(*) FROM likes WHERE target_type = 'comment' AND target_id = ${internalId}) WHERE id = ${internalId}`;
  const rows = await d.sql`SELECT likes_count FROM comments WHERE id = ${internalId}`;
  return json({ liked, likesCount: Number((rows[0] as { likes_count: number }).likes_count) });
}

export async function checkLikes(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const qp = queryParams(req);
  const targetType = qp.get("targetType") || "article";
  const ids = (qp.get("targetIds") || "").split(",").filter(Boolean);
  if (!ids.length) return ok({});
  const rows = await db().sql`
    SELECT p.document_id FROM likes l
    JOIN posts p ON p.id = l.target_id
    WHERE l.user_id = ${viewer.userId} AND l.target_type = ${targetType} AND p.document_id = ANY(${ids})
  `;
  const set = new Set(rows.map((r) => String((r as { document_id: string }).document_id)));
  const result: Record<string, boolean> = {};
  for (const id of ids) result[id] = set.has(id);
  return ok(result);
}

// ── 收藏 ───────────────────────────────────────────────
export async function toggleFavorite(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const { targetId } = await readJson<{ targetId?: string }>(req);
  if (!targetId) return badRequest("缺少参数");
  const d = db();
  const post = await d.sql`SELECT id FROM posts WHERE document_id = ${targetId}`;
  if (post.length === 0) return notFound("委托不存在");
  const pid = Number((post[0] as { id: number }).id);
  const existing = await d.sql`SELECT id FROM favorites WHERE user_id = ${viewer.userId} AND post_id = ${pid}`;
  let favorited: boolean;
  if (existing.length > 0) {
    await d.sql`DELETE FROM favorites WHERE id = ${Number((existing[0] as { id: number }).id)}`;
    favorited = false;
  } else {
    await d.sql`INSERT INTO favorites (user_id, post_id) VALUES (${viewer.userId}, ${pid})`;
    favorited = true;
  }
  await d.sql`UPDATE posts SET favorites_count = (SELECT count(*) FROM favorites WHERE post_id = ${pid}) WHERE id = ${pid}`;
  const rows = await d.sql`SELECT favorites_count FROM posts WHERE id = ${pid}`;
  return json({ favorited, favoritesCount: Number((rows[0] as { favorites_count: number }).favorites_count) });
}

export async function checkFavorites(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const ids = (queryParams(req).get("targetIds") || "").split(",").filter(Boolean);
  if (!ids.length) return ok({});
  const rows = await db().sql`
    SELECT p.document_id FROM favorites f JOIN posts p ON p.id = f.post_id
    WHERE f.user_id = ${viewer.userId} AND p.document_id = ANY(${ids})
  `;
  const set = new Set(rows.map((r) => String((r as { document_id: string }).document_id)));
  const result: Record<string, boolean> = {};
  for (const id of ids) result[id] = set.has(id);
  return ok(result);
}

// ── 关注 ───────────────────────────────────────────────
async function userIdByDocument(documentId: string): Promise<number | null> {
  const rows = await db().sql`SELECT id FROM users WHERE document_id = ${documentId}`;
  return rows.length ? Number((rows[0] as { id: number }).id) : null;
}

export async function toggleFollow(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const { authorDocumentId } = await readJson<{ authorDocumentId?: string }>(req);
  if (!authorDocumentId) return badRequest("缺少参数");
  const target = await userIdByDocument(authorDocumentId);
  if (!target) return notFound("用户不存在");
  if (target === viewer.userId) return badRequest("不能关注自己");
  const d = db();
  const existing = await d.sql`SELECT id FROM follows WHERE follower_id = ${viewer.userId} AND following_id = ${target}`;
  let following: boolean;
  if (existing.length > 0) {
    await d.sql`DELETE FROM follows WHERE id = ${Number((existing[0] as { id: number }).id)}`;
    following = false;
  } else {
    await d.sql`INSERT INTO follows (follower_id, following_id) VALUES (${viewer.userId}, ${target})`;
    following = true;
  }
  const count = await d.sql`SELECT count(*)::int AS n FROM follows WHERE following_id = ${target}`;
  return json({ following, followersCount: Number((count[0] as { n: number }).n) });
}

export async function checkFollows(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const ids = (queryParams(req).get("authorIds") || "").split(",").filter(Boolean);
  if (!ids.length) return ok({});
  const rows = await db().sql`
    SELECT u.document_id FROM follows f JOIN users u ON u.id = f.following_id
    WHERE f.follower_id = ${viewer.userId} AND u.document_id = ANY(${ids})
  `;
  const set = new Set(rows.map((r) => String((r as { document_id: string }).document_id)));
  const result: Record<string, boolean> = {};
  for (const id of ids) result[id] = set.has(id);
  return ok(result);
}

// ── 拉黑 ───────────────────────────────────────────────
export async function toggleUserBlock(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const { authorDocumentId } = await readJson<{ authorDocumentId?: string }>(req);
  if (!authorDocumentId) return badRequest("缺少参数");
  const target = await userIdByDocument(authorDocumentId);
  if (!target) return notFound("用户不存在");
  if (target === viewer.userId) return badRequest("不能拉黑自己");
  const d = db();
  const existing = await d.sql`SELECT id FROM user_blocks WHERE blocker_id = ${viewer.userId} AND blocked_id = ${target}`;
  let blocked: boolean;
  if (existing.length > 0) {
    await d.sql`DELETE FROM user_blocks WHERE id = ${Number((existing[0] as { id: number }).id)}`;
    blocked = false;
  } else {
    await d.sql`INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (${viewer.userId}, ${target})`;
    blocked = true;
  }
  return json({ blocked, authorDocumentId });
}

export async function checkUserBlocks(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const ids = (queryParams(req).get("authorIds") || "").split(",").filter(Boolean);
  if (!ids.length) return ok({});
  const rows = await db().sql`
    SELECT u.document_id FROM user_blocks b JOIN users u ON u.id = b.blocked_id
    WHERE b.blocker_id = ${viewer.userId} AND u.document_id = ANY(${ids})
  `;
  const set = new Set(rows.map((r) => String((r as { document_id: string }).document_id)));
  const result: Record<string, boolean> = {};
  for (const id of ids) result[id] = set.has(id);
  return ok(result);
}

export async function myBlockedList(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const qp = queryParams(req);
  const start = Math.max(0, int(qp.get("start")));
  const limit = Math.min(50, Math.max(1, int(qp.get("limit"), 20)));
  const rows = await db().sql`
    SELECT u.document_id, u.username, u.name, u.level, u.avatar_url, b.created_at
    FROM user_blocks b JOIN users u ON u.id = b.blocked_id
    WHERE b.blocker_id = ${viewer.userId}
    ORDER BY b.created_at DESC LIMIT ${limit} OFFSET ${start}
  `;
  return ok(
    rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        documentId: String(row.document_id),
        name: row.name ? String(row.name) : String(row.username),
        username: String(row.username),
        level: Number(row.level),
        avatar: String(row.avatar_url || DEFAULT_AVATAR),
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      };
    }),
  );
}

// ── 举报 ───────────────────────────────────────────────
export async function createReport(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const { targetType, targetId, reason, detail } = await readJson<{ targetType?: string; targetId?: string; reason?: string; detail?: string }>(req);
  if (!targetType || !targetId || !reason) return badRequest("缺少参数");
  const documentId = crypto.randomUUID();
  await db().sql`
    INSERT INTO reports (document_id, reporter_id, target_type, target_id, reason, detail)
    VALUES (${documentId}, ${viewer.userId}, ${targetType}, ${targetId}, ${reason}, ${detail || null})
  `;
  return ok({ documentId });
}

export async function checkReports(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const qp = queryParams(req);
  const targetType = qp.get("targetType") || "article";
  const ids = (qp.get("targetIds") || "").split(",").filter(Boolean);
  if (!ids.length) return ok({});
  const rows = await db().sql`
    SELECT target_id FROM reports WHERE reporter_id = ${viewer.userId} AND target_type = ${targetType} AND target_id = ANY(${ids})
  `;
  const set = new Set(rows.map((r) => String((r as { target_id: string }).target_id)));
  const result: Record<string, boolean> = {};
  for (const id of ids) result[id] = set.has(id);
  return ok(result);
}

// ── 作者搜索（@ 提及） ───────────────────────────────
export async function searchAuthors(req: Request): Promise<Response> {
  const qp = queryParams(req);
  const q = (qp.get("q") || "").trim();
  const limit = Math.min(20, Math.max(1, int(qp.get("limit"), 8)));
  if (!q) return ok([]);
  const rows = await db().sql.unsafe(
    `SELECT document_id, username, name, level, avatar_url FROM users
     WHERE username ILIKE $1 OR name ILIKE $1 OR email ILIKE $1
     ORDER BY level DESC LIMIT $2`,
    [`%${q}%`, limit],
  );
  return ok(
    rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        documentId: String(row.document_id),
        name: row.name ? String(row.name) : String(row.username),
        username: String(row.username),
        level: Number(row.level),
        avatar: String(row.avatar_url || DEFAULT_AVATAR),
      };
    }),
  );
}
