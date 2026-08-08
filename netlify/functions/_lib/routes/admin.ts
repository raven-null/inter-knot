/** 后台管理路由：统计 / 用户 / 帖子 / 评论 / 版块 / 设置 */

import { db, genId } from "../db";
import { requireAdmin } from "../auth";
import { json, badRequest, notFound, int, readJson, queryParams } from "../http";
import { toCategory, toPost, toComment, DEFAULT_AVATAR } from "../serialize";

const PAGE_SIZE = 20;

export async function stats(req: Request): Promise<Response> {
  await requireAdmin(req);
  const d = db();
  const [userCount, postCount, commentCount, viewCount, todayPosts, todayComments, pendingPosts, categoryCount] = await Promise.all([
    d.sql`SELECT count(*)::int AS n FROM users`,
    d.sql`SELECT count(*)::int AS n FROM posts WHERE status = 'published'`,
    d.sql`SELECT count(*)::int AS n FROM comments`,
    d.sql`SELECT COALESCE(sum(views), 0)::int AS n FROM posts`,
    d.sql`SELECT count(*)::int AS n FROM posts WHERE status = 'published' AND created_at >= now() - interval '24 hours'`,
    d.sql`SELECT count(*)::int AS n FROM comments WHERE created_at >= now() - interval '24 hours'`,
    d.sql`SELECT count(*)::int AS n FROM posts WHERE status = 'pending'`,
    d.sql`SELECT count(*)::int AS n FROM categories`,
  ]);
  const recentUsers = await d.sql`SELECT document_id, username, name, level, avatar_url, created_at FROM users ORDER BY created_at DESC LIMIT 5`;
  const recentPosts = await d.sql`SELECT document_id, title, views, likes_count, comments_count, created_at FROM posts WHERE status = 'published' ORDER BY created_at DESC LIMIT 5`;
  const n = (arr: unknown[], key = "n") => Number((arr[0] as Record<string, number> | undefined)?.[key] || 0);
  return json({
    userCount: n(userCount),
    postCount: n(postCount),
    commentCount: n(commentCount),
    viewCount: n(viewCount),
    todayPosts: n(todayPosts),
    todayComments: n(todayComments),
    pendingPosts: n(pendingPosts),
    categoryCount: n(categoryCount),
    recentUsers: recentUsers.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        documentId: String(row.document_id),
        username: String(row.username),
        name: String(row.name || row.username),
        level: Number(row.level || 1),
        avatar: String(row.avatar_url || DEFAULT_AVATAR),
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      };
    }),
    recentPosts: recentPosts.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        documentId: String(row.document_id),
        title: String(row.title),
        views: Number(row.views || 0),
        likesCount: Number(row.likes_count || 0),
        commentsCount: Number(row.comments_count || 0),
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      };
    }),
  });
}

function pageParams(req: Request): { start: number; limit: number; q: string; status: string } {
  const qp = queryParams(req);
  return {
    start: Math.max(0, int(qp.get("page") ? (int(qp.get("page")) - 1) * PAGE_SIZE : int(qp.get("start")))),
    limit: Math.min(50, Math.max(1, int(qp.get("pageSize") || qp.get("limit"), PAGE_SIZE))),
    q: qp.get("q") || "",
    status: qp.get("status") || "",
  };
}

export async function users(req: Request): Promise<Response> {
  await requireAdmin(req);
  const { start, limit, q } = pageParams(req);
  const d = db();
  const where = q ? `WHERE username ILIKE $1 OR name ILIKE $1 OR email ILIKE $1` : "";
  const params = q ? [`%${q}%`] : [];
  const total = await d.sql.unsafe(`SELECT count(*)::int AS n FROM users ${where}`, params);
  const rows = await d.sql.unsafe(
    `SELECT id, document_id, username, name, email, avatar_url, level, exp, role, status, created_at
     FROM users ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, start],
  );
  const totalCount = Number((total[0] as { n: number }).n);
  return json({
    data: rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        documentId: String(row.document_id),
        username: String(row.username),
        name: String(row.name || row.username),
        email: row.email ? String(row.email) : "",
        avatar: String(row.avatar_url || DEFAULT_AVATAR),
        level: Number(row.level || 1),
        exp: Number(row.exp || 0),
        role: String(row.role),
        status: String(row.status),
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      };
    }),
    meta: { pagination: { page: Math.floor(start / limit) + 1, pageSize: limit, total: totalCount, pageCount: Math.ceil(totalCount / limit) } },
  });
}

export async function updateUser(req: Request): Promise<Response> {
  await requireAdmin(req);
  const id = decodeURIComponent(req.url.split("?")[0]!.split("/").filter(Boolean).pop() || "");
  const { role, status } = await readJson<{ role?: string; status?: string }>(req);
  const d = db();
  const rows = await d.sql`SELECT id FROM users WHERE document_id = ${id}`;
  if (rows.length === 0) return notFound("用户不存在");
  if (role && !["user", "moderator", "admin"].includes(role)) return badRequest("角色不合法");
  if (status && !["active", "banned"].includes(status)) return badRequest("状态不合法");
  await d.sql`
    UPDATE users SET
      role = COALESCE(${role}, role),
      status = COALESCE(${status}, status)
    WHERE id = ${Number((rows[0] as { id: number }).id)}
  `;
  return json({ success: true });
}

export async function posts(req: Request): Promise<Response> {
  await requireAdmin(req);
  const { start, limit, q, status } = pageParams(req);
  const d = db();
  const where: string[] = [];
  const params: unknown[] = [];
  if (q) {
    params.push(`%${q}%`);
    where.push(`(p.title ILIKE $${params.length} OR p.text ILIKE $${params.length})`);
  }
  if (status) {
    params.push(status);
    where.push(`p.status = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = await d.sql.unsafe(`SELECT count(*)::int AS n FROM posts p ${whereSql}`, params);
  const rows = await d.sql.unsafe(
    `SELECT p.id, p.document_id, p.title, p.text, p.cover_width, p.cover_height, p.covers,
            p.status, p.is_pinned, p.is_hidden, p.views, p.likes_count, p.comments_count,
            p.created_at, p.updated_at,
            c.name AS category_name, c.slug AS category_slug,
            u.document_id AS author_document_id, u.username AS author_username, u.name AS author_name,
            u.avatar_url AS author_avatar_url, u.level AS author_level, u.exp AS author_exp
     FROM posts p
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN users u ON u.id = p.author_id
     ${whereSql} ORDER BY p.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, start],
  );
  const totalCount = Number((total[0] as { n: number }).n);
  return json({
    data: rows.map((r) => toPost(r as never)),
    meta: { pagination: { page: Math.floor(start / limit) + 1, pageSize: limit, total: totalCount, pageCount: Math.ceil(totalCount / limit) } },
  });
}

export async function updatePost(req: Request): Promise<Response> {
  await requireAdmin(req);
  const id = decodeURIComponent(req.url.split("?")[0]!.split("/").filter(Boolean).pop() || "");
  const body = await readJson<{ status?: string; isPinned?: boolean; isHidden?: boolean }>(req);
  const d = db();
  const rows = await d.sql`SELECT id FROM posts WHERE document_id = ${id}`;
  if (rows.length === 0) return notFound("帖子不存在");
  if (body.status && !["published", "pending", "deleted", "draft"].includes(body.status)) return badRequest("状态不合法");
  await d.sql`
    UPDATE posts SET
      status = COALESCE(${body.status}, status),
      is_pinned = COALESCE(${body.isPinned}, is_pinned),
      is_hidden = COALESCE(${body.isHidden}, is_hidden),
      updated_at = now()
    WHERE id = ${Number((rows[0] as { id: number }).id)}
  `;
  return json({ success: true });
}

export async function comments(req: Request): Promise<Response> {
  await requireAdmin(req);
  const { start, limit, q } = pageParams(req);
  const d = db();
  const where = q ? `WHERE c.content ILIKE $1` : "";
  const params = q ? [`%${q}%`] : [];
  const total = await d.sql.unsafe(`SELECT count(*)::int AS n FROM comments c ${where}`, params);
  const rows = await d.sql.unsafe(
    `SELECT c.id, c.document_id, c.post_id, c.author_id, c.parent_id, c.content, c.images,
            c.is_pinned, c.likes_count, c.floor, c.created_at,
            u.document_id AS author_document_id, u.username AS author_username, u.name AS author_name,
            u.avatar_url AS author_avatar_url, u.level AS author_level
     FROM comments c LEFT JOIN users u ON u.id = c.author_id
     ${where} ORDER BY c.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, start],
  );
  const totalCount = Number((total[0] as { n: number }).n);
  return json({
    data: rows.map((r) => toComment(r as never)),
    meta: { pagination: { page: Math.floor(start / limit) + 1, pageSize: limit, total: totalCount, pageCount: Math.ceil(totalCount / limit) } },
  });
}

export async function deleteComment(req: Request): Promise<Response> {
  await requireAdmin(req);
  const id = decodeURIComponent(req.url.split("?")[0]!.split("/").filter(Boolean).pop() || "");
  const rows = await db().sql`SELECT id, post_id FROM comments WHERE document_id = ${id}`;
  if (rows.length === 0) return notFound("评论不存在");
  const row = rows[0] as { id: number; post_id: number };
  await db().sql`DELETE FROM comments WHERE id = ${Number(row.id)}`;
  await db().sql`UPDATE posts SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = ${Number(row.post_id)}`;
  return json({ success: true });
}

export async function categories(req: Request): Promise<Response> {
  await requireAdmin(req);
  const rows = await db().sql`
    SELECT document_id, name, slug, description, icon, sort_order, is_hidden, is_admin_only, created_at
    FROM categories ORDER BY sort_order ASC, created_at ASC
  `;
  return json({ data: rows.map((r) => toCategory(r as never)) });
}

export async function createCategory(req: Request): Promise<Response> {
  await requireAdmin(req);
  const { name, slug, description, sortOrder } = await readJson<{ name?: string; slug?: string; description?: string; sortOrder?: number }>(req);
  const cleanName = String(name || "").trim();
  const cleanSlug = String(slug || "").trim().toLowerCase().replace(/\s+/g, "-");
  if (!cleanName || !cleanSlug) return badRequest("名称与标识不能为空");
  await db().sql`
    INSERT INTO categories (document_id, name, slug, description, sort_order)
    VALUES (${genId()}, ${cleanName}, ${cleanSlug}, ${String(description || "")}, ${int(sortOrder)})
  `;
  return json({ success: true });
}

export async function updateCategory(req: Request): Promise<Response> {
  await requireAdmin(req);
  const id = decodeURIComponent(req.url.split("?")[0]!.split("/").filter(Boolean).pop() || "");
  const { name, slug, description, sortOrder, isHidden } = await readJson<{ name?: string; slug?: string; description?: string; sortOrder?: number; isHidden?: boolean }>(req);
  await db().sql`
    UPDATE categories SET
      name = COALESCE(${name}, name),
      slug = COALESCE(${slug}, slug),
      description = COALESCE(${description}, description),
      sort_order = COALESCE(${int(sortOrder)}, sort_order),
      is_hidden = COALESCE(${isHidden}, is_hidden)
    WHERE document_id = ${id}
  `;
  return json({ success: true });
}

export async function deleteCategory(req: Request): Promise<Response> {
  await requireAdmin(req);
  const id = decodeURIComponent(req.url.split("?")[0]!.split("/").filter(Boolean).pop() || "");
  await db().sql`DELETE FROM categories WHERE document_id = ${id}`;
  return json({ success: true });
}

export async function settings(req: Request): Promise<Response> {
  await requireAdmin(req);
  const rows = await db().sql`SELECT key, value FROM settings WHERE key LIKE 'site.%'`;
  const map: Record<string, string> = {};
  for (const r of rows) {
    const row = r as { key: string; value: string };
    map[row.key.replace(/^site\./, "")] = row.value;
  }
  return json({
    siteName: map.siteName || "绳网",
    announcement: map.announcement || "",
    allowRegister: map.allowRegister !== "false",
    needAudit: map.needAudit === "true",
  });
}

export async function updateSettings(req: Request): Promise<Response> {
  await requireAdmin(req);
  const { siteName, announcement, allowRegister, needAudit } = await readJson<{ siteName?: string; announcement?: string; allowRegister?: boolean; needAudit?: boolean }>(req);
  const d = db();
  const entries: Array<[string, string]> = [];
  if (siteName !== undefined) entries.push(["siteName", String(siteName)]);
  if (announcement !== undefined) entries.push(["announcement", String(announcement)]);
  if (allowRegister !== undefined) entries.push(["allowRegister", String(allowRegister)]);
  if (needAudit !== undefined) entries.push(["needAudit", String(needAudit)]);
  for (const [k, v] of entries) {
    await d.sql`
      INSERT INTO settings (key, value) VALUES (${`site.${k}`}, ${v})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    `;
  }
  return json({ success: true });
}
