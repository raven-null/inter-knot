/** 帖子/委托相关路由 */

import { db, genId } from "../db";
import { resolveUser, requireAuth } from "../auth";
import { ok, paginated, json, badRequest, notFound, int, bool, readJson, queryParams } from "../http";
import { toPost, toDraft, type PostRow, type ViewerState } from "../serialize";

const PAGE_SIZE = 20;

export const POST_SELECT = `
  p.id, p.document_id, p.category_id, p.author_id, p.title, p.text, p.body,
  p.covers, p.cover_width, p.cover_height, p.external_videos, p.status,
  p.is_pinned, p.is_anonymous, p.is_hidden, p.views, p.likes_count,
  p.comments_count, p.favorites_count, p.created_at, p.updated_at, p.published_at,
  c.name AS category_name, c.slug AS category_slug,
  u.document_id AS author_document_id, u.username AS author_username,
  u.name AS author_name, u.avatar_url AS author_avatar_url,
  u.level AS author_level, u.exp AS author_exp
`;

async function postViewerState(viewer: { userId: number } | null, postIds: string[]): Promise<ViewerState> {
  const state: ViewerState = { viewer: viewer as never, likedIds: new Set(), favoritedIds: new Set(), readIds: new Set() };
  if (!viewer || postIds.length === 0) return state;
  const d = db();
  const likeRows = await d.sql`
    SELECT p.document_id FROM likes l JOIN posts p ON p.id = l.target_id
    WHERE l.user_id = ${viewer.userId} AND l.target_type = 'article' AND p.document_id = ANY(${postIds})
  `;
  for (const r of likeRows) state.likedIds!.add(String((r as { document_id: string }).document_id));
  const favRows = await d.sql`
    SELECT p.document_id FROM favorites f JOIN posts p ON p.id = f.post_id
    WHERE f.user_id = ${viewer.userId} AND p.document_id = ANY(${postIds})
  `;
  for (const r of favRows) state.favoritedIds!.add(String((r as { document_id: string }).document_id));
  const readRows = await d.sql`
    SELECT post_id FROM read_records WHERE user_id = ${viewer.userId} AND post_id IN (
      SELECT id FROM posts WHERE document_id = ANY(${postIds})
    )
  `;
  const readInternal = new Set(readRows.map((r) => Number((r as { post_id: number }).post_id)));
  const mapRows = await d.sql`SELECT id, document_id FROM posts WHERE document_id = ANY(${postIds})`;
  for (const r of mapRows) {
    const row = r as { id: number; document_id: string };
    if (readInternal.has(Number(row.id))) state.readIds!.add(row.document_id);
  }
  return state;
}

interface ListOptions {
  start: number;
  limit: number;
  q: string;
  category: string;
  feed: string;
}

async function listPosts(req: Request, opts: ListOptions): Promise<Response> {
  const viewer = await resolveUser(req);
  const d = db();

  const where: string[] = [`p.status = 'published'`, `p.is_hidden = false`];
  const params: unknown[] = [];
  let pidx = 1;

  const add = (cond: string, value: unknown) => {
    params.push(value);
    where.push(cond.replaceAll("?", `$${pidx++}`));
  };

  if (opts.q) add(`(p.title ILIKE '%' || ? || '%' OR p.text ILIKE '%' || ? || '%')`, opts.q);
  if (opts.category) add(`c.slug = ?`, opts.category);

  if (opts.feed === "following") {
    if (!viewer) return paginated([], opts.start, opts.limit, 0);
    add(`p.author_id IN (SELECT following_id FROM follows WHERE follower_id = ?)`, viewer.userId);
  } else if (opts.feed === "favorites") {
    if (!viewer) return paginated([], opts.start, opts.limit, 0);
    add(`p.id IN (SELECT post_id FROM favorites WHERE user_id = ?)`, viewer.userId);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const count = await d.sql.unsafe(`SELECT count(*)::int AS total FROM posts p LEFT JOIN categories c ON c.id = p.category_id ${whereSql}`, params);
  const total = count[0] ? Number((count[0] as { total: number }).total) : 0;

  const rows = await d.sql.unsafe(
    `SELECT ${POST_SELECT} FROM posts p
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN users u ON u.id = p.author_id
     ${whereSql}
     ORDER BY p.is_pinned DESC, p.created_at DESC
     LIMIT ${opts.limit} OFFSET ${opts.start}`,
    params,
  );

  const postIds = rows.map((r) => String((r as PostRow).document_id));
  const state = await postViewerState(viewer ? { userId: viewer.userId } : null, postIds);
  const nodes = rows.map((r) => toPost(r as PostRow, state)).filter(Boolean);
  return paginated(nodes, opts.start, opts.limit, total);
}

export async function list(req: Request): Promise<Response> {
  const qp = queryParams(req);
  const start = Math.max(0, int(qp.get("start")));
  const limit = Math.min(50, Math.max(1, int(qp.get("limit"), PAGE_SIZE)));
  return listPosts(req, {
    start,
    limit,
    q: qp.get("q") || "",
    category: qp.get("category") || "",
    feed: qp.get("feed") || "recommend",
  });
}

export async function suggest(req: Request): Promise<Response> {
  const qp = queryParams(req);
  const q = (qp.get("q") || "").trim();
  if (!q) return ok([]);
  const rows = await db().sql.unsafe(
    `SELECT p.document_id, p.title, p.text, p.is_anonymous,
            u.username AS author_name, c.name AS category_name, c.slug AS category_slug
     FROM posts p
     LEFT JOIN users u ON u.id = p.author_id
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.status = 'published' AND p.is_hidden = false
       AND (p.title ILIKE '%' || $1 || '%')
     ORDER BY p.created_at DESC LIMIT 8`,
    [q],
  );
  return ok(
    rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        documentId: String(row.document_id),
        title: String(row.title),
        titleHighlighted: String(row.title),
        excerpt: String(row.text || "").slice(0, 60),
        authorName: row.author_name ? String(row.author_name) : null,
        categoryName: row.category_name ? String(row.category_name) : null,
        categorySlug: row.category_slug ? String(row.category_slug) : null,
        isAnonymous: row.is_anonymous === true,
      };
    }),
  );
}

async function findPostByDocumentId(documentId: string): Promise<PostRow | null> {
  const rows = await db().sql.unsafe(
    `SELECT ${POST_SELECT} FROM posts p
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN users u ON u.id = p.author_id
     WHERE p.document_id = $1 LIMIT 1`,
    [documentId],
  );
  return (rows[0] as PostRow) || null;
}

export async function detail(req: Request): Promise<Response> {
  const id = decodeURIComponent(req.url.split("?")[0]!.split("/").pop() || "");
  const viewer = await resolveUser(req);
  const row = await findPostByDocumentId(id);
  if (!row) return notFound("委托不存在");
  if (row.status === "deleted") return notFound("委托不存在");
  if (row.status !== "published" && row.status !== "pending") {
    const isOwner = viewer && Number(row.author_id) === Number(viewer.userId);
    if (!isOwner && viewer?.role !== "admin") return notFound("委托不存在");
  }
  if (row.is_hidden && viewer?.role !== "admin" && Number(row.author_id) !== Number(viewer.userId)) {
    return notFound("委托不存在");
  }
  const state = await postViewerState(viewer ? { userId: viewer.userId } : null, [row.document_id]);
  const post = toPost(row, state);
  // 浏览量 +1（幂等不依赖登录态）
  await db().sql`UPDATE posts SET views = views + 1 WHERE id = ${Number(row.id)}`;
  post!.views = Number(row.views) + 1;
  return ok(post);
}

export async function view(req: Request): Promise<Response> {
  const id = decodeURIComponent(req.url.split("/").filter(Boolean).find((s) => s !== "articles" && s !== "api") || "");
  const row = await findPostByDocumentId(id);
  if (!row) return notFound();
  const updated = await db().sql`UPDATE posts SET views = views + 1 WHERE id = ${Number(row.id)} RETURNING views`;
  return json({ views: Number((updated[0] as { views: number }).views) });
}

async function parseDraftBody(req: Request): Promise<Record<string, unknown>> {
  const body = await readJson<{ data?: Record<string, unknown> }>(req);
  return body.data || {};
}

export async function createDraft(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const d = db();
  const data = await parseDraftBody(req);
  const title = String(data.title || "无标题").slice(0, 200);
  const text = String(data.text || "");
  const covers = Array.isArray(data.cover)
    ? (data.cover as unknown[]).map((c) => (typeof c === "string" ? c : String((c as { url?: string })?.url || ""))).filter(Boolean)
    : typeof data.cover === "string"
      ? [data.cover]
      : [];
  const categorySlug = typeof data.category === "string" ? data.category : undefined;
  const category = categorySlug
    ? await d.sql`SELECT id FROM categories WHERE slug = ${categorySlug}`
    : [];
  const documentId = genId();
  const externalVideos = Array.isArray(data.externalVideos) ? JSON.stringify(data.externalVideos) : null;
  const editorState = data.editorState ? JSON.stringify(data.editorState) : null;
  const inserted = await d.sql`
    INSERT INTO posts (document_id, category_id, author_id, title, text, covers, external_videos, editor_state, status, is_anonymous)
    VALUES (${documentId}, ${category.length ? Number(category[0].id) : null}, ${viewer.userId}, ${title}, ${text}, ${covers}, ${externalVideos}, ${editorState}, 'draft', ${bool(data.isAnonymous)})
    RETURNING id, document_id, title, text, external_videos, covers, editor_state, created_at, updated_at
  `;
  const row = inserted[0] as Record<string, unknown>;
  return ok(toDraft(row as never));
}

export async function updateDraft(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const id = decodeURIComponent(req.url.split("?")[0]!.split("/").filter(Boolean).pop() || "");
  const d = db();
  const existing = await d.sql`SELECT id FROM posts WHERE document_id = ${id} AND author_id = ${viewer.userId} AND status = 'draft'`;
  if (existing.length === 0) return notFound("草稿不存在");
  const data = await parseDraftBody(req);
  const title = data.title !== undefined ? String(data.title).slice(0, 200) : undefined;
  const text = data.text !== undefined ? String(data.text) : undefined;
  const covers = Array.isArray(data.cover)
    ? (data.cover as unknown[]).map((c) => (typeof c === "string" ? c : String((c as { url?: string })?.url || ""))).filter(Boolean)
    : data.cover !== undefined && typeof data.cover === "string"
      ? [data.cover]
      : undefined;
  const externalVideos = data.externalVideos !== undefined ? JSON.stringify(data.externalVideos || []) : undefined;
  const editorState = data.editorState !== undefined ? JSON.stringify(data.editorState || null) : undefined;
  const isAnonymous = data.isAnonymous !== undefined ? bool(data.isAnonymous) : undefined;
  const categorySlug = typeof data.category === "string" ? data.category : undefined;
  const category = categorySlug ? await d.sql`SELECT id FROM categories WHERE slug = ${categorySlug}` : null;

  const sets: string[] = [];
  const params: unknown[] = [];
  let pidx = 1;
  const set = (col: string, value: unknown) => {
    params.push(value);
    sets.push(`${col} = $${pidx++}`);
  };
  if (title !== undefined) set("title", title);
  if (text !== undefined) set("text", text);
  if (covers !== undefined) set("covers", covers);
  if (externalVideos !== undefined) set("external_videos", externalVideos);
  if (editorState !== undefined) set("editor_state", editorState);
  if (isAnonymous !== undefined) set("is_anonymous", isAnonymous);
  if (category) {
    params.push(category.length ? Number(category[0].id) : null);
    sets.push(`category_id = $${pidx++}`);
  }
  params.push(id);
  sets.push("updated_at = now()");
  await d.sql.unsafe(
    `UPDATE posts SET ${sets.join(", ")} WHERE document_id = $${pidx}`,
    params,
  );
  const updated = await d.sql`
    SELECT document_id, title, text, external_videos, covers, editor_state, created_at, updated_at,
           c.name AS category_name, c.slug AS category_slug
    FROM posts p LEFT JOIN categories c ON c.id = p.category_id WHERE p.document_id = ${id}
  `;
  return ok(toDraft(updated[0] as never));
}

function idBeforeAction(req: Request): string {
  const segments = req.url.split("?")[0]!.split("/").filter(Boolean);
  return decodeURIComponent(segments[segments.length - 2] || "");
}

export async function publishDraft(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const id = idBeforeAction(req);
  const d = db();
  const existing = await d.sql`
    SELECT id FROM posts WHERE document_id = ${id} AND author_id = ${viewer.userId} AND status = 'draft'
  `;
  if (existing.length === 0) return notFound("草稿不存在");
  await d.sql`
    UPDATE posts SET status = 'published', published_at = now(), updated_at = now()
    WHERE id = ${Number(existing[0].id)}
  `;
  return json({ success: true });
}

export async function discardDraft(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const id = idBeforeAction(req);
  const d = db();
  await d.sql`DELETE FROM posts WHERE document_id = ${id} AND author_id = ${viewer.userId} AND status = 'draft'`;
  return json({ success: true });
}

export async function remove(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const id = decodeURIComponent(req.url.split("?")[0]!.split("/").filter(Boolean).pop() || "");
  const d = db();
  const existing = await d.sql`SELECT id, author_id FROM posts WHERE document_id = ${id} AND status = 'draft'`;
  if (existing.length === 0) {
    // 已发布委托：作者本人或管理员可删除
    const pub = await d.sql`SELECT id, author_id FROM posts WHERE document_id = ${id} AND status = 'published'`;
    if (pub.length === 0) return notFound("委托不存在");
    if (Number(pub[0].author_id) !== viewer.userId && viewer.role !== "admin") return badRequest("无权删除");
    await d.sql`UPDATE posts SET status = 'deleted', is_hidden = true WHERE id = ${Number(pub[0].id)}`;
    return json({ success: true });
  }
  await d.sql`DELETE FROM posts WHERE id = ${Number(existing[0].id)}`;
  return json({ success: true });
}

export async function myDrafts(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const qp = queryParams(req);
  const start = Math.max(0, int(qp.get("start")));
  const limit = Math.min(50, Math.max(1, int(qp.get("limit"), PAGE_SIZE)));
  const rows = await db().sql`
    SELECT document_id, title, text, external_videos, covers, editor_state, created_at, updated_at
    FROM posts WHERE author_id = ${viewer.userId} AND status = 'draft'
    ORDER BY updated_at DESC LIMIT ${limit} OFFSET ${start}
  `;
  return paginated(rows.map((r) => toDraft(r as never)), start, limit, rows.length);
}

export async function myDraftDetail(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const id = decodeURIComponent(req.url.split("/").filter(Boolean).pop() || "");
  const rows = await db().sql`
    SELECT document_id, title, text, external_videos, covers, editor_state, created_at, updated_at,
           c.name AS category_name, c.slug AS category_slug
    FROM posts p LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.document_id = ${id} AND p.author_id = ${viewer.userId} AND p.status = 'draft'
  `;
  if (rows.length === 0) return notFound("草稿不存在");
  return ok(toDraft(rows[0] as never));
}

export async function triple(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const { articleId } = await readJson<{ articleId?: string }>(req);
  if (!articleId) return badRequest("缺少参数");
  const d = db();
  const post = await d.sql`SELECT id, document_id, likes_count, favorites_count FROM posts WHERE document_id = ${articleId}`;
  if (post.length === 0) return notFound("委托不存在");
  const pid = Number((post[0] as { id: number }).id);

  // 点赞（幂等）
  const likeExisting = await d.sql`SELECT id FROM likes WHERE user_id = ${viewer.userId} AND target_type = 'article' AND target_id = ${pid}`;
  let liked = likeExisting.length > 0;
  if (!liked) {
    await d.sql`INSERT INTO likes (user_id, target_type, target_id) VALUES (${viewer.userId}, 'article', ${pid})`;
    await d.sql`UPDATE posts SET likes_count = likes_count + 1 WHERE id = ${pid}`;
    liked = true;
  }
  // 收藏（幂等）
  const favExisting = await d.sql`SELECT id FROM favorites WHERE user_id = ${viewer.userId} AND post_id = ${pid}`;
  let favorited = favExisting.length > 0;
  if (!favorited) {
    await d.sql`INSERT INTO favorites (user_id, post_id) VALUES (${viewer.userId}, ${pid})`;
    await d.sql`UPDATE posts SET favorites_count = favorites_count + 1 WHERE id = ${pid}`;
    favorited = true;
  }
  const updated = await d.sql`SELECT likes_count, favorites_count FROM posts WHERE id = ${pid}`;
  return json({
    liked,
    likesCount: Number((updated[0] as { likes_count: number }).likes_count),
    favorited,
    favoritesCount: Number((updated[0] as { favorites_count: number }).favorites_count),
    coinGiven: true,
    coinReason: "OK",
    dennyCount: 0,
    newBalance: null,
  });
}

export async function bilibiliInfo(): Promise<Response> {
  return ok(null);
}

export async function markReadBatch(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const { articleDocumentIds, markAsRead } = await readJson<{ articleDocumentIds?: string[]; markAsRead?: boolean }>(req);
  const ids = Array.isArray(articleDocumentIds) ? articleDocumentIds.filter(Boolean) : [];
  if (ids.length === 0) return json({ success: true });
  const d = db();
  const postRows = await d.sql`SELECT id, document_id FROM posts WHERE document_id = ANY(${ids})`;
  if (markAsRead === true) {
    for (const r of postRows) {
      const row = r as { id: number; document_id: string };
      await d.sql`
        INSERT INTO read_records (user_id, post_id) VALUES (${viewer.userId}, ${Number(row.id)})
        ON CONFLICT (user_id, post_id) DO NOTHING
      `;
    }
  } else {
    for (const r of postRows) {
      const row = r as { id: number; document_id: string };
      await d.sql`DELETE FROM read_records WHERE user_id = ${viewer.userId} AND post_id = ${Number(row.id)}`;
    }
  }
  return json({ success: true });
}
