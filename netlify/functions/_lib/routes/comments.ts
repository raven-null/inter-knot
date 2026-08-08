/** 评论相关路由 */

import { db, genId } from "../db";
import { resolveUser, requireAuth } from "../auth";
import { ok, json, badRequest, notFound, int, bool, readJson, queryParams } from "../http";
import { toComment, type CommentRow } from "../serialize";

const COMMENT_SELECT = `
  c.id, c.document_id, c.post_id, c.author_id, c.parent_id, c.content, c.images,
  c.is_pinned, c.likes_count, c.floor, c.created_at,
  u.document_id AS author_document_id, u.username AS author_username,
  u.name AS author_name, u.avatar_url AS author_avatar_url, u.level AS author_level
`;

async function buildCommentTree(postId: number, viewerId: number | null): Promise<Record<string, unknown>[]> {
  const d = db();
  const rows = await d.sql.unsafe(
    `SELECT ${COMMENT_SELECT} FROM comments c LEFT JOIN users u ON u.id = c.author_id
     WHERE c.post_id = $1 AND c.parent_id IS NULL
     ORDER BY c.is_pinned DESC, c.created_at ASC`,
    [postId],
  );
  const replies = await d.sql.unsafe(
    `SELECT ${COMMENT_SELECT} FROM comments c LEFT JOIN users u ON u.id = c.author_id
     WHERE c.post_id = $1 AND c.parent_id IS NOT NULL
     ORDER BY c.created_at ASC`,
    [postId],
  );

  let likedIds: Set<string> | undefined;
  if (viewerId != null) {
    const likeRows = await d.sql`
      SELECT c.document_id FROM likes l JOIN comments c ON c.id = l.target_id
      WHERE l.user_id = ${viewerId} AND l.target_type = 'comment' AND c.post_id = ${postId}
    `;
    likedIds = new Set(likeRows.map((r) => String((r as { document_id: string }).document_id)));
  }

  const byId = new Map<number, Record<string, unknown>>();
  const result: Record<string, unknown>[] = [];
  for (const r of rows) {
    const row = r as CommentRow;
    const node = toComment(row, likedIds);
    if (node) {
      node.replies = [];
      byId.set(Number(row.id), node);
      result.push(node);
    }
  }
  for (const r of replies) {
    const row = r as CommentRow;
    if (row.parent_id == null) continue;
    const parent = byId.get(Number(row.parent_id));
    const node = toComment(row, likedIds);
    if (parent && node) (parent.replies as unknown[]).push(node);
  }
  return result;
}

export async function list(req: Request): Promise<Response> {
  const qp = queryParams(req);
  const articleId = qp.get("article") || "";
  const start = Math.max(0, int(qp.get("start")));
  const limit = Math.min(50, Math.max(1, int(qp.get("limit"), 20)));
  const viewer = await resolveUser(req);

  if (!articleId) return ok([]);
  const post = await db().sql`SELECT id FROM posts WHERE document_id = ${articleId}`;
  if (post.length === 0) return ok([]);
  const postId = Number((post[0] as { id: number }).id);

  const total = await db().sql`SELECT count(*)::int AS total FROM comments WHERE post_id = ${postId} AND parent_id IS NULL`;
  const all = await buildCommentTree(postId, viewer ? viewer.userId : null);
  const sorted = all.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return 0;
  });

  const pinned = sorted.find((c) => c.isPinned === true) || null;
  const pageNodes = sorted.slice(start, start + limit);
  const meta = { pagination: { start, limit, total: Number((total[0] as { total: number }).total), pageCount: Math.ceil(Number((total[0] as { total: number }).total) / limit) } };
  const body: Record<string, unknown> = { data: pageNodes, meta, pinned };
  return json(body);
}

export async function create(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const d = db();
  const body = await readJson<{ data?: Record<string, unknown> }>(req);
  const data = body.data || {};
  const postId = String(data.article || "");
  const content = String(data.content || "").trim();
  const parentId = data.parent ? String(data.parent) : undefined;
  const images = Array.isArray(data.images)
    ? data.images.filter((u): u is string => typeof u === "string" && u.length > 0)
    : [];

  if (!postId) return badRequest("缺少委托 ID");
  if (!content && images.length === 0) return badRequest("评论内容不能为空");

  const post = await d.sql`SELECT id FROM posts WHERE document_id = ${postId}`;
  if (post.length === 0) return notFound("委托不存在");
  const pid = Number((post[0] as { id: number }).id);

  let parentInternal: number | null = null;
  if (parentId) {
    const parent = await d.sql`SELECT id FROM comments WHERE document_id = ${parentId}`;
    if (parent.length === 0) return notFound("回复的评论不存在");
    parentInternal = Number((parent[0] as { id: number }).id);
  }

  const floor = await d.sql`SELECT count(*)::int AS n FROM comments WHERE post_id = ${pid}`;

  const documentId = genId();
  const inserted = await d.sql`
    INSERT INTO comments (document_id, post_id, author_id, parent_id, content, images, is_anonymous, floor)
    VALUES (${documentId}, ${pid}, ${viewer.userId}, ${parentInternal}, ${content}, ${images}, ${bool(data.isAnonymous)}, ${Number((floor[0] as { n: number }).n) + 1})
    RETURNING id
  `;
  await d.sql`UPDATE posts SET comments_count = comments_count + 1 WHERE id = ${pid}`;

  const row = await d.sql.unsafe(
    `SELECT ${COMMENT_SELECT} FROM comments c LEFT JOIN users u ON u.id = c.author_id WHERE c.id = $1`,
    [Number((inserted[0] as { id: number }).id)],
  );
  const node = toComment(row[0] as CommentRow, new Set());
  node!.replies = [];
  return ok(node);
}

async function findComment(req: Request): Promise<{ id: number; document_id: string; post_id: number; author_id: number | null } | null> {
  const cid = decodeURIComponent(req.url.split("?")[0]!.split("/").filter(Boolean).pop() || "");
  const rows = await db().sql`SELECT id, document_id, post_id, author_id FROM comments WHERE document_id = ${cid}`;
  return (rows[0] as { id: number; document_id: string; post_id: number; author_id: number | null }) || null;
}

export async function remove(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const comment = await findComment(req);
  if (!comment) return notFound("评论不存在");
  if (Number(comment.author_id) !== viewer.userId && viewer.role !== "admin") {
    return badRequest("无权删除");
  }
  await db().sql`DELETE FROM comments WHERE id = ${Number(comment.id)}`;
  await db().sql`UPDATE posts SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = ${Number(comment.post_id)}`;
  return json({ success: true });
}

export async function pin(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const comment = await findComment(req);
  if (!comment) return notFound("评论不存在");
  if (viewer.role !== "admin" && viewer.role !== "moderator") return badRequest("无权置顶");
  await db().sql`UPDATE comments SET is_pinned = true WHERE id = ${Number(comment.id)}`;
  return json({ success: true });
}

export async function unpin(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const comment = await findComment(req);
  if (!comment) return notFound("评论不存在");
  if (viewer.role !== "admin" && viewer.role !== "moderator") return badRequest("无权取消置顶");
  await db().sql`UPDATE comments SET is_pinned = false WHERE id = ${Number(comment.id)}`;
  return json({ success: true });
}
