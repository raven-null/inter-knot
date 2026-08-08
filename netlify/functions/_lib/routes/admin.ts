/** 后台管理路由：统计 / 用户 / 帖子 / 评论 / 版块 / 设置（基于 Netlify Blobs） */

import { genId, getJson, setJson, del, listKeys, KEYS, categoryKey } from "../storage";
import { getFeed, feedUpsert, feedRemove, feedUpdate, getStats, bumpStats, getUser, updateUserStats } from "../feed";
import { requireAdmin } from "../auth";
import { json, badRequest, notFound, int, readJson, queryParams } from "../http";
import { toCategory, toPost, toComment, DEFAULT_AVATAR, type Doc } from "../serialize";

const PAGE_SIZE = 20;

async function allPostDocs(): Promise<Doc[]> {
  const keys = (await listKeys("posts/")).filter((k) => !k.includes("/_lookup/"));
  const docs: Doc[] = [];
  for (const key of keys) {
    const d = await getJson<Doc>(key);
    if (d) docs.push(d);
  }
  docs.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  return docs;
}

function pageSlice<T>(items: T[], page: number, pageSize: number): { data: T[]; total: number; pageCount: number } {
  const start = (page - 1) * pageSize;
  return {
    data: items.slice(start, start + pageSize),
    total: items.length,
    pageCount: Math.ceil(items.length / pageSize),
  };
}

export async function stats(req: Request): Promise<Response> {
  await requireAdmin(req);
  const s = await getStats();
  const keys = (await listKeys("users/")).filter((k) => !k.includes("/by-email/"));
  const recentUsers: Doc[] = [];
  for (const key of keys) {
    const u = await getJson<Doc>(key);
    if (u) recentUsers.push(u);
  }
  recentUsers.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));

  const feed = await getFeed();
  const allPosts = await allPostDocs();
  const pendingPosts = allPosts.filter((p) => p.status === "pending").length;
  const today = new Date().toISOString().slice(0, 10);
  const todayPosts = feed.filter((p) => String(p.created_at || "").startsWith(today)).length;
  const commentKeys = (await listKeys("comments/")).filter((k) => !k.includes("/_lookup/"));
  let todayComments = 0;
  for (const key of commentKeys) {
    const c = await getJson<Doc>(key);
    if (c && String(c.created_at || "").startsWith(today)) todayComments += 1;
  }

  return json({
    userCount: Number(s.userCount || 0),
    postCount: Number(s.postCount || 0),
    commentCount: Number(s.commentCount || 0),
    viewCount: Number(s.viewCount || 0),
    todayPosts,
    todayComments,
    pendingPosts,
    categoryCount: (await listKeys("categories/")).length,
    recentUsers: recentUsers.slice(0, 5).map((u) => ({
      documentId: String(u.document_id),
      username: String(u.username || ""),
      name: String(u.name || u.username || ""),
      level: Number(u.level || 1),
      avatar: String(u.avatar_url || DEFAULT_AVATAR),
      createdAt: String(u.created_at || ""),
    })),
    recentPosts: feed.slice(0, 5).map((p) => ({
      documentId: String(p.document_id),
      title: String(p.title || ""),
      views: Number(p.views || 0),
      likesCount: Number(p.likes_count || 0),
      commentsCount: Number(p.comments_count || 0),
      createdAt: String(p.created_at || ""),
    })),
  });
}

export async function users(req: Request): Promise<Response> {
  await requireAdmin(req);
  const qp = queryParams(req);
  const page = Math.max(1, int(qp.get("page"), 1));
  const pageSize = Math.min(50, Math.max(1, int(qp.get("pageSize"), PAGE_SIZE)));
  const q = (qp.get("q") || "").toLowerCase();

  const keys = (await listKeys("users/")).filter((k) => !k.includes("/by-email/"));
  const all: Doc[] = [];
  for (const key of keys) {
    const u = await getJson<Doc>(key);
    if (u) all.push(u);
  }
  all.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));

  const filtered = q
    ? all.filter((u) => {
        const hay = `${u.username || ""} ${u.name || ""} ${u.email || ""}`.toLowerCase();
        return hay.includes(q);
      })
    : all;
  const { data, total, pageCount } = pageSlice(filtered, page, pageSize);
  return json({
    data: data.map((u) => ({
      documentId: String(u.document_id),
      username: String(u.username || ""),
      name: String(u.name || u.username || ""),
      email: u.email ? String(u.email) : "",
      avatar: String(u.avatar_url || DEFAULT_AVATAR),
      level: Number(u.level || 1),
      exp: Number(u.exp || 0),
      role: String(u.role || "user"),
      status: String(u.status || "active"),
      createdAt: String(u.created_at || ""),
    })),
    meta: { pagination: { page, pageSize, total, pageCount } },
  });
}

export async function updateUser(req: Request): Promise<Response> {
  await requireAdmin(req);
  const id = decodeURIComponent(req.url.split("?")[0]!.split("/").filter(Boolean).pop() || "");
  const { role, status } = await readJson<{ role?: string; status?: string }>(req);
  const u = await getUser(id);
  if (!u) return notFound("用户不存在");
  if (role && !["user", "moderator", "admin"].includes(role)) return badRequest("角色不合法");
  if (status && !["active", "banned"].includes(status)) return badRequest("状态不合法");
  await setJson(`users/${id}.json`, {
    ...u,
    role: role ?? u.role,
    status: status ?? u.status,
  });
  return json({ success: true });
}

export async function posts(req: Request): Promise<Response> {
  await requireAdmin(req);
  const qp = queryParams(req);
  const page = Math.max(1, int(qp.get("page"), 1));
  const pageSize = Math.min(50, Math.max(1, int(qp.get("pageSize"), PAGE_SIZE)));
  const q = (qp.get("q") || "").toLowerCase();
  const status = qp.get("status") || "";

  const all = await allPostDocs();
  const filtered = all.filter((p) => {
    if (status && p.status !== status) return false;
    if (q && !`${p.title || ""} ${p.text || ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const { data, total, pageCount } = pageSlice(filtered, page, pageSize);
  return json({
    data: data.map((p) => toPost(p)).filter(Boolean),
    meta: { pagination: { page, pageSize, total, pageCount } },
  });
}

export async function updatePost(req: Request): Promise<Response> {
  await requireAdmin(req);
  const id = decodeURIComponent(req.url.split("?")[0]!.split("/").filter(Boolean).pop() || "");
  const body = await readJson<{ status?: string; isPinned?: boolean; isHidden?: boolean }>(req);
  const doc = await getJson<Doc>(`posts/${id}.json`);
  if (!doc) return notFound("帖子不存在");
  if (body.status && !["published", "pending", "deleted", "draft"].includes(body.status)) return badRequest("状态不合法");

  const next: Doc = {
    ...doc,
    status: body.status ?? doc.status,
    is_pinned: body.isPinned ?? doc.is_pinned,
    is_hidden: body.isHidden ?? doc.is_hidden,
    updated_at: new Date().toISOString(),
  };
  await setJson(`posts/${id}.json`, next);

  // 同步信息流索引
  if (next.status === "published" && !next.is_hidden) {
    await feedUpsert(next);
  } else {
    await feedRemove(id);
  }
  return json({ success: true });
}

export async function comments(req: Request): Promise<Response> {
  await requireAdmin(req);
  const qp = queryParams(req);
  const page = Math.max(1, int(qp.get("page"), 1));
  const pageSize = Math.min(50, Math.max(1, int(qp.get("pageSize"), PAGE_SIZE)));
  const q = (qp.get("q") || "").toLowerCase();

  const keys = (await listKeys("comments/")).filter((k) => !k.includes("/_lookup/"));
  const all: Doc[] = [];
  for (const key of keys) {
    const d = await getJson<Doc>(key);
    if (d) all.push(d);
  }
  all.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  const filtered = q ? all.filter((c) => String(c.content || "").toLowerCase().includes(q)) : all;
  const { data, total, pageCount } = pageSlice(filtered, page, pageSize);
  return json({
    data: data.map((c) => toComment(c)).filter(Boolean),
    meta: { pagination: { page, pageSize, total, pageCount } },
  });
}

export async function deleteComment(req: Request): Promise<Response> {
  await requireAdmin(req);
  const id = decodeURIComponent(req.url.split("?")[0]!.split("/").filter(Boolean).pop() || "");
  const lookup = await getJson<{ post_id: string; key: string }>(KEYS.commentLookup(id));
  if (!lookup) return notFound("评论不存在");
  const doc = await getJson<Doc>(lookup.key);
  if (!doc) return notFound("评论不存在");

  await del(lookup.key);
  await del(KEYS.commentLookup(id));
  await setJson(KEYS.userComments(String(doc.author_document_id || "")), []);

  const post = await getJson<Doc>(`posts/${lookup.post_id}.json`);
  if (post) {
    const updated = { ...post, comments_count: Math.max(0, Number(post.comments_count || 0) - 1) };
    await setJson(`posts/${lookup.post_id}.json`, updated);
    await feedUpdate(lookup.post_id, { comments_count: updated.comments_count });
  }
  await updateUserStats(String(doc.author_document_id), { commentCount: -1 });
  await bumpStats({ commentCount: -1 });
  return json({ success: true });
}

export async function categories(req: Request): Promise<Response> {
  await requireAdmin(req);
  const keys = await listKeys("categories/");
  const all: Doc[] = [];
  for (const key of keys) {
    const c = await getJson<Doc>(key);
    if (c) all.push(c);
  }
  all.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  return json({ data: all.map((c) => toCategory(c)) });
}

export async function createCategory(req: Request): Promise<Response> {
  await requireAdmin(req);
  const { name, slug, description, sortOrder } = await readJson<{ name?: string; slug?: string; description?: string; sortOrder?: number }>(req);
  const cleanName = String(name || "").trim();
  const cleanSlug = String(slug || "").trim().toLowerCase().replace(/\s+/g, "-");
  if (!cleanName || !cleanSlug) return badRequest("名称与标识不能为空");
  await setJson(categoryKey(genId()), {
    document_id: genId(),
    name: cleanName,
    slug: cleanSlug,
    description: String(description || ""),
    icon: "",
    sort_order: int(sortOrder),
    is_hidden: false,
    is_admin_only: false,
    created_at: new Date().toISOString(),
  });
  return json({ success: true });
}

export async function updateCategory(req: Request): Promise<Response> {
  await requireAdmin(req);
  const id = decodeURIComponent(req.url.split("?")[0]!.split("/").filter(Boolean).pop() || "");
  const { name, slug, description, sortOrder, isHidden } = await readJson<{ name?: string; slug?: string; description?: string; sortOrder?: number; isHidden?: boolean }>(req);
  const c = await getJson<Doc>(categoryKey(id));
  if (!c) return notFound("版块不存在");
  await setJson(categoryKey(id), {
    ...c,
    name: name ?? c.name,
    slug: slug ?? c.slug,
    description: description ?? c.description,
    sort_order: sortOrder != null ? int(sortOrder) : c.sort_order,
    is_hidden: isHidden ?? c.is_hidden,
  });
  return json({ success: true });
}

export async function deleteCategory(req: Request): Promise<Response> {
  await requireAdmin(req);
  const id = decodeURIComponent(req.url.split("?")[0]!.split("/").filter(Boolean).pop() || "");
  await del(categoryKey(id));
  return json({ success: true });
}

export async function settings(req: Request): Promise<Response> {
  await requireAdmin(req);
  const s = (await getJson<Doc>(KEYS.settings)) || {};
  return json({
    siteName: String(s.siteName || "绳网"),
    announcement: String(s.announcement || ""),
    allowRegister: s.allowRegister !== false,
    needAudit: s.needAudit === true,
  });
}

export async function updateSettings(req: Request): Promise<Response> {
  await requireAdmin(req);
  const { siteName, announcement, allowRegister, needAudit } = await readJson<{ siteName?: string; announcement?: string; allowRegister?: boolean; needAudit?: boolean }>(req);
  const s = (await getJson<Doc>(KEYS.settings)) || {};
  await setJson(KEYS.settings, {
    ...s,
    siteName: siteName ?? s.siteName,
    announcement: announcement ?? s.announcement,
    allowRegister: allowRegister ?? s.allowRegister,
    needAudit: needAudit ?? s.needAudit,
  });
  return json({ success: true });
}
