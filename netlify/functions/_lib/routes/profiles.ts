/** 个人主页相关路由 */

import { db } from "../db";
import { resolveUser } from "../auth";
import { ok, paginated, notFound, int, queryParams } from "../http";
import { toPost, toComment, DEFAULT_AVATAR, type PostRow, type ViewerState, type CommentRow } from "../serialize";
import { POST_SELECT } from "./articles";

export async function detail(req: Request): Promise<Response> {
  const id = decodeURIComponent(req.url.split("?")[0]!.split("/").filter(Boolean).pop() || "");
  const viewer = await resolveUser(req);
  const d = db();
  const rows = await d.sql`
    SELECT id, document_id, username, name, bio, avatar_url, level, exp, role, status, profile_hidden, created_at
    FROM users WHERE document_id = ${id}
  `;
  if (rows.length === 0) return notFound("用户不存在");
  const row = rows[0] as Record<string, unknown>;
  const userId = Number(row.id);
  const isSelf = viewer != null && viewer.userId === userId;

  let isFollowing = false;
  let followersCount = 0;
  let followingCount = 0;
  let isBlockedByMe = false;
  let hasBlockedMe = false;

  if (viewer) {
    const fol = await d.sql`SELECT id FROM follows WHERE follower_id = ${viewer.userId} AND following_id = ${userId}`;
    isFollowing = fol.length > 0;
    const b1 = await d.sql`SELECT id FROM user_blocks WHERE blocker_id = ${viewer.userId} AND blocked_id = ${userId}`;
    isBlockedByMe = b1.length > 0;
    const b2 = await d.sql`SELECT id FROM user_blocks WHERE blocker_id = ${userId} AND blocked_id = ${viewer.userId}`;
    hasBlockedMe = b2.length > 0;
  }
  const fCount = await d.sql`SELECT count(*)::int AS n FROM follows WHERE following_id = ${userId}`;
  followersCount = Number((fCount[0] as { n: number }).n);
  const gCount = await d.sql`SELECT count(*)::int AS n FROM follows WHERE follower_id = ${userId}`;
  followingCount = Number((gCount[0] as { n: number }).n);

  const stats = await d.sql`
    SELECT
      (SELECT count(*)::int FROM posts WHERE author_id = ${userId} AND status = 'published') AS article_count,
      (SELECT count(*)::int FROM comments WHERE author_id = ${userId}) AS comment_count,
      (SELECT COALESCE(sum(views), 0)::int FROM posts WHERE author_id = ${userId}) AS total_views,
      (SELECT COALESCE(sum(comments_count), 0)::int FROM posts WHERE author_id = ${userId}) AS total_comments,
      (SELECT COALESCE(sum(likes_count), 0)::int FROM posts WHERE author_id = ${userId}) AS total_likes
  `;
  const s = (stats[0] as Record<string, number>);

  return ok({
    documentId: String(row.document_id),
    userId,
    uid: userId,
    login: String(row.username),
    name: row.name ? String(row.name) : String(row.username),
    bio: String(row.bio || ""),
    avatar: String(row.avatar_url || DEFAULT_AVATAR),
    level: Number(row.level || 1),
    exp: Number(row.exp || 0),
    isSelf,
    isHidden: false,
    profileHidden: row.profile_hidden === true,
    isAiAgent: false,
    isBlockedByMe,
    hasBlockedMe,
    isFollowing,
    followersCount,
    followingCount,
    stats: {
      articleCount: Number(s.article_count || 0),
      commentCount: Number(s.comment_count || 0),
      totalViews: Number(s.total_views || 0),
      totalComments: Number(s.total_comments || 0),
      totalLikes: Number(s.total_likes || 0),
    },
    equippedCard: null,
    equippedAvatar: null,
  });
}

export async function articles(req: Request): Promise<Response> {
  const id = decodeURIComponent(req.url.split("/").filter(Boolean)[req.url.split("/").filter(Boolean).length - 2] || "");
  const qp = queryParams(req);
  const start = Math.max(0, int(qp.get("start")));
  const limit = Math.min(50, Math.max(1, int(qp.get("limit"), 20)));
  const viewer = await resolveUser(req);

  const user = await db().sql`SELECT id FROM users WHERE document_id = ${id}`;
  if (user.length === 0) return notFound("用户不存在");
  const userId = Number((user[0] as { id: number }).id);

  const total = await db().sql`
    SELECT count(*)::int AS total FROM posts WHERE author_id = ${userId} AND status = 'published' AND is_hidden = false
  `;
  const rows = await db().sql.unsafe(
    `SELECT ${POST_SELECT} FROM posts p
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN users u ON u.id = p.author_id
     WHERE p.author_id = $1 AND p.status = 'published' AND p.is_hidden = false
     ORDER BY p.created_at DESC LIMIT $2 OFFSET $3`,
    [userId, limit, start],
  );

  const postIds = rows.map((r) => String((r as PostRow).document_id));
  const state: ViewerState = { viewer: viewer as never, likedIds: new Set(), favoritedIds: new Set(), readIds: new Set() };
  if (viewer) {
    const lr = await db().sql`SELECT p.document_id FROM likes l JOIN posts p ON p.id = l.target_id WHERE l.user_id = ${viewer.userId} AND l.target_type = 'article' AND p.document_id = ANY(${postIds})`;
    for (const r of lr) state.likedIds!.add(String((r as { document_id: string }).document_id));
    const fr = await db().sql`SELECT p.document_id FROM favorites f JOIN posts p ON p.id = f.post_id WHERE f.user_id = ${viewer.userId} AND p.document_id = ANY(${postIds})`;
    for (const r of fr) state.favoritedIds!.add(String((r as { document_id: string }).document_id));
    const rr = await db().sql`SELECT p.document_id FROM read_records rc JOIN posts p ON p.id = rc.post_id WHERE rc.user_id = ${viewer.userId} AND p.document_id = ANY(${postIds})`;
    for (const r of rr) state.readIds!.add(String((r as { document_id: string }).document_id));
  }
  const nodes = rows.map((r) => toPost(r as PostRow, state)).filter(Boolean);
  return paginated(nodes, start, limit, Number((total[0] as { total: number }).total));
}

export async function comments(req: Request): Promise<Response> {
  const segments = req.url.split("?")[0]!.split("/").filter(Boolean);
  const id = decodeURIComponent(segments[segments.length - 2] || "");
  const qp = queryParams(req);
  const start = Math.max(0, int(qp.get("start")));
  const limit = Math.min(50, Math.max(1, int(qp.get("limit"), 20)));
  const viewer = await resolveUser(req);

  const user = await db().sql`SELECT id FROM users WHERE document_id = ${id}`;
  if (user.length === 0) return notFound("用户不存在");
  const userId = Number((user[0] as { id: number }).id);

  const total = await db().sql`SELECT count(*)::int AS total FROM comments WHERE author_id = ${userId}`;
  const rows = await db().sql`
    SELECT c.id, c.document_id, c.post_id, c.author_id, c.parent_id, c.content, c.images,
           c.is_pinned, c.likes_count, c.floor, c.created_at,
           u.document_id AS author_document_id, u.username AS author_username,
           u.name AS author_name, u.avatar_url AS author_avatar_url, u.level AS author_level
    FROM comments c LEFT JOIN users u ON u.id = c.author_id
    WHERE c.author_id = ${userId}
    ORDER BY c.created_at DESC LIMIT ${limit} OFFSET ${start}
  `;
  let likedIds: Set<string> | undefined;
  if (viewer) {
    const ids = rows.map((r) => String((r as CommentRow).document_id));
    if (ids.length) {
      const lr = await db().sql`SELECT c.document_id FROM likes l JOIN comments c ON c.id = l.target_id WHERE l.user_id = ${viewer.userId} AND l.target_type = 'comment' AND c.document_id = ANY(${ids})`;
      likedIds = new Set(lr.map((r) => String((r as { document_id: string }).document_id)));
    }
  }
  const nodes = rows.map((r) => toComment(r as CommentRow, likedIds)).filter(Boolean);
  return paginated(nodes, start, limit, Number((total[0] as { total: number }).total));
}
