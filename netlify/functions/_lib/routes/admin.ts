/** 后台管理路由：统计 / 用户 / 帖子 / 评论 / 版块 / 设置（基于 Netlify Blobs） */

import { genId, getJson, setJson, del, listKeys, KEYS, categoryKey, userKey } from "../storage";
import { getFeed, feedUpsert, feedRemove, feedUpdate, getStats, bumpStats, getUser, updateUserStats } from "../feed";
import { requireAdmin } from "../auth";
import { json, badRequest, notFound, int, readJson, queryParams } from "../http";
import { toCategory, toPost, toComment, DEFAULT_AVATAR, type Doc } from "../serialize";

const PAGE_SIZE = 20;

/** 近 30 天每日计数：新帖 / 新评论 / 新用户 */
async function buildTrend(
  feed: Doc[],
  commentKeys: string[],
): Promise<Array<{ date: string; posts: number; comments: number; users: number }>> {
  const days: string[] = [];
  const postsByDay = new Map<string, number>();
  const commentsByDay = new Map<string, number>();
  const usersByDay = new Map<string, number>();
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1000).toISOString().slice(0, 10);
    days.push(d);
    postsByDay.set(d, 0);
    commentsByDay.set(d, 0);
    usersByDay.set(d, 0);
  }
  for (const p of feed) {
    const d = String(p.created_at || "").slice(0, 10);
    if (postsByDay.has(d)) postsByDay.set(d, (postsByDay.get(d) || 0) + 1);
  }
  for (const key of commentKeys) {
    const c = await getJson<{ created_at?: string }>(key);
    const d = String(c?.created_at || "").slice(0, 10);
    if (commentsByDay.has(d)) commentsByDay.set(d, (commentsByDay.get(d) || 0) + 1);
  }
  const userKeys = (await listKeys("users/")).filter(
    (k) => !k.includes("/by-email/") && !k.includes("/by-uid/"),
  );
  for (const key of userKeys) {
    const u = await getJson<{ created_at?: string }>(key);
    const d = String(u?.created_at || "").slice(0, 10);
    if (usersByDay.has(d)) usersByDay.set(d, (usersByDay.get(d) || 0) + 1);
  }
  return days.map((date) => ({
    date,
    posts: postsByDay.get(date) || 0,
    comments: commentsByDay.get(date) || 0,
    users: usersByDay.get(date) || 0,
  }));
}

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
  const keys = (await listKeys("users/")).filter(
    (k) => !k.includes("/by-email/") && !k.includes("/by-uid/") && !k.includes("/by-github/"),
  );
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

  // 近 30 天趋势（新帖/新评论/新用户，按日）
  const trend = await buildTrend(feed, commentKeys);

  return json({
    userCount: Number(s.userCount || 0),
    postCount: feed.length, // 以信息流为准（发布即入流），避免计数漂移成负数
    commentCount: Number(s.commentCount || 0),
    viewCount: Number(s.viewCount || 0),
    todayPosts,
    todayComments,
    pendingPosts,
    categoryCount: (await listKeys("categories/")).length,
    trend,
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

  const keys = (await listKeys("users/")).filter(
    (k) => !k.includes("/by-email/") && !k.includes("/by-uid/"),
  );
  const all: Doc[] = [];
  for (const key of keys) {
    const u = await getJson<Doc>(key);
    if (u) all.push(u);
  }
  all.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));

  const filtered = q
    ? all.filter((u) => {
        const hay = `${u.username || ""} ${u.name || ""} ${u.email || ""} ${u.uid || ""}`.toLowerCase();
        return hay.includes(q);
      })
    : all;
  const { data, total, pageCount } = pageSlice(filtered, page, pageSize);
  return json({
    data: data.map((u) => ({
      documentId: String(u.document_id),
      uid: Number(u.uid || 0),
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

  // 状态切换时的计数与信息流同步
  const wasPublished = doc.status === "published" && doc.is_hidden !== true;
  const isPublished = next.status === "published" && next.is_hidden !== true;
  if (isPublished && !wasPublished) {
    await feedUpsert(next);
    await bumpStats({ postCount: 1 });
    await updateUserStats(String(doc.author_document_id), { articleCount: 1 });
  } else if (wasPublished && !isPublished) {
    await feedRemove(id);
    await bumpStats({ postCount: -1 });
    await updateUserStats(String(doc.author_document_id), { articleCount: -1 });
  } else if (isPublished) {
    await feedUpsert(next);
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

// ── 举报管理 ─────────────────────────────────────────
async function allReports(): Promise<Doc[]> {
  const keys = (await listKeys("reports/")).filter((k) => !k.includes("/_by-id/"));
  const docs: Doc[] = [];
  for (const key of keys) {
    const r = await getJson<Doc>(key);
    if (r) docs.push(r);
  }
  docs.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  return docs;
}

export async function reports(req: Request): Promise<Response> {
  await requireAdmin(req);
  const qp = queryParams(req);
  const page = Math.max(1, int(qp.get("page"), 1));
  const pageSize = Math.min(50, Math.max(1, int(qp.get("pageSize"), PAGE_SIZE)));
  const status = qp.get("status") || "";
  const all = await allReports();
  const filtered = status ? all.filter((r) => r.status === status) : all;
  const { data, total, pageCount } = pageSlice(filtered, page, pageSize);

  // 附带举报人与目标摘要
  const enriched: Doc[] = [];
  for (const r of data) {
    const reporter = await getUser(String(r.reporter_id || ""));
    let target: Doc | null = null;
    const targetId = String(r.target_id || "");
    const targetType = String(r.target_type || "");
    if (targetType === "post") {
      const p = await getJson<Doc>(`posts/${targetId}.json`);
      if (p) target = { type: "post", title: p.title, documentId: p.document_id, status: p.status };
    } else if (targetType === "comment") {
      const lookup = await getJson<{ key: string }>(KEYS.commentLookup(targetId));
      if (lookup) {
        const c = await getJson<Doc>(lookup.key);
        if (c) target = { type: "comment", content: String(c.content || "").slice(0, 60), documentId: c.document_id };
      }
    } else if (targetType === "user") {
      const u = await getUser(targetId);
      if (u) target = { type: "user", name: u.name || u.username, documentId: u.document_id };
    }
    enriched.push({
      documentId: String(r.document_id),
      targetType,
      targetId,
      reason: r.reason,
      detail: r.detail || undefined,
      status: r.status,
      createdAt: String(r.created_at || ""),
      reporter: reporter ? { documentId: reporter.document_id, name: reporter.name || reporter.username } : null,
      target,
    });
  }

  return json({
    data: enriched,
    meta: { pagination: { page, pageSize, total, pageCount } },
  });
}

export async function processReport(req: Request): Promise<Response> {
  await requireAdmin(req);
  const id = decodeURIComponent(req.url.split("?")[0]!.split("/").filter(Boolean).pop() || "");
  const { action } = await readJson<{ action?: string }>(req);
  if (action !== "delete" && action !== "dismiss") return badRequest("action 仅支持 delete / dismiss");

  const all = await allReports();
  const report = all.find((r) => r.document_id === id);
  if (!report) return notFound("举报不存在");

  const targetType = String(report.target_type || "");
  const targetId = String(report.target_id || "");

  if (action === "delete") {
    if (targetType === "post") {
      const p = await getJson<Doc>(`posts/${targetId}.json`);
      if (p && p.status !== "deleted") {
        await setJson(`posts/${targetId}.json`, { ...p, status: "deleted", is_hidden: true, updated_at: new Date().toISOString() });
        await feedRemove(targetId);
        if (p.status === "published") {
          await bumpStats({ postCount: -1 });
          await updateUserStats(String(p.author_document_id), { articleCount: -1 });
        }
      }
    } else if (targetType === "comment") {
      const lookup = await getJson<{ key: string; post_id: string }>(KEYS.commentLookup(targetId));
      if (lookup) {
        const c = await getJson<Doc>(lookup.key);
        if (c) {
          await del(lookup.key);
          await del(KEYS.commentLookup(targetId));
          await setJson(KEYS.userComments(String(c.author_document_id || "")), []);
          const post = await getJson<Doc>(`posts/${lookup.post_id}.json`);
          if (post) {
            const updated = { ...post, comments_count: Math.max(0, Number(post.comments_count || 0) - 1) };
            await setJson(`posts/${lookup.post_id}.json`, updated);
            await feedUpdate(lookup.post_id, { comments_count: updated.comments_count });
          }
          await updateUserStats(String(c.author_document_id), { commentCount: -1 });
          await bumpStats({ commentCount: -1 });
        }
      }
    } else if (targetType === "user") {
      const u = await getUser(targetId);
      if (u) await setJson(`users/${targetId}.json`, { ...u, status: "banned" });
    }
  }

  // 就地更新举报状态
  const newStatus = action === "delete" ? "resolved" : "dismissed";
  const keys = (await listKeys("reports/")).filter((k) => !k.includes("/_by-id/"));
  for (const key of keys) {
    const r = await getJson<Doc>(key);
    if (r && r.document_id === id) {
      await setJson(key, { ...r, status: newStatus, processed_at: new Date().toISOString() });
      break;
    }
  }
  return json({ success: true });
}
