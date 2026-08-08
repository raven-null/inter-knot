/** 帖子/帖子相关路由（基于 Netlify Blobs） */

import { genId, getJson, setJson, del, exists, listKeys, postKey, categoryKey, userKey, likeKey, favoriteKey, readKey, KEYS } from "../storage";
import { getFeed, feedAdd, feedRemove, feedUpdate, bumpStats, getUser, updateUserStats } from "../feed";
import { resolveUser, requireAuth } from "../auth";
import { ok, paginated, json, badRequest, notFound, int, bool, readJson, queryParams } from "../http";
import { toPost, toDraft, DEFAULT_AVATAR, type Doc, type ViewerState } from "../serialize";

const PAGE_SIZE = 20;
const UPLOAD_BY_DOC = (id: string) => `uploads/by-document/${id}.json`;

// ── 草稿索引 ─────────────────────────────────────────
async function draftIds(userId: string): Promise<string[]> {
  return (await getJson<string[]>(KEYS.drafts(userId))) ?? [];
}
async function addDraft(userId: string, id: string): Promise<void> {
  const ids = await draftIds(userId);
  if (!ids.includes(id)) {
    ids.unshift(id);
    await setJson(KEYS.drafts(userId), ids);
  }
}
async function removeDraft(userId: string, id: string): Promise<void> {
  const ids = (await draftIds(userId)).filter((x) => x !== id);
  await setJson(KEYS.drafts(userId), ids);
}

// ── 分类 / 作者 / 封面 辅助 ──────────────────────────
async function categoryBySlug(slug: string | undefined): Promise<Doc | null> {
  if (!slug) return null;
  const keys = await listKeys("categories/");
  for (const k of keys) {
    const c = await getJson<Doc>(k);
    if (c && c.slug === slug) return c;
  }
  return null;
}

async function authorFields(userId: string): Promise<Doc> {
  const u = await getUser(userId);
  return {
    author_id: userId,
    author_document_id: userId,
    author_username: u?.username || "",
    author_name: u?.name || u?.username || "",
    author_avatar_url: u?.avatar_url || DEFAULT_AVATAR,
    author_level: u?.level ?? 1,
    author_exp: u?.exp ?? 0,
  };
}

/** 前端 cover 传的是上传文件 documentId（string 或 string[]），解析为 {documentId,url,width,height} */
async function resolveCovers(input: unknown): Promise<{
  covers: Array<{ documentId: string; url: string; width?: number; height?: number }>;
  width?: number;
  height?: number;
}> {
  const ids = Array.isArray(input) ? input.map(String) : input ? [String(input)] : [];
  const covers: Array<{ documentId: string; url: string; width?: number; height?: number }> = [];
  for (const id of ids) {
    const meta = await getJson<{ url?: string; width?: number; height?: number }>(UPLOAD_BY_DOC(id));
    if (meta?.url) {
      covers.push({
        documentId: id,
        url: String(meta.url),
        width: meta.width != null ? Number(meta.width) : undefined,
        height: meta.height != null ? Number(meta.height) : undefined,
      });
    }
  }
  return { covers, width: covers[0]?.width, height: covers[0]?.height };
}

// ── 帖子文档读写 ─────────────────────────────────────
async function getPostDoc(documentId: string): Promise<Doc | null> {
  return getJson<Doc>(postKey(documentId));
}

async function touchPost(documentId: string, patch: Doc): Promise<void> {
  const doc = await getPostDoc(documentId);
  if (doc) await setJson(postKey(documentId), { ...doc, ...patch });
  await feedUpdate(documentId, patch);
}

// ── 个性化状态（点赞/收藏/已读） ─────────────────────
async function viewerState(viewer: { userId: string } | null, ids: string[]): Promise<ViewerState> {
  const state: ViewerState = { viewer: viewer as never, likedIds: new Set(), favoritedIds: new Set(), readIds: new Set() };
  if (!viewer || ids.length === 0) return state;
  const [liked, favorited, read] = await Promise.all([
    Promise.all(ids.map((id) => exists(likeKey(viewer.userId, "article", id)))),
    Promise.all(ids.map((id) => exists(favoriteKey(viewer.userId, id)))),
    Promise.all(ids.map((id) => exists(readKey(viewer.userId, id)))),
  ]);
  ids.forEach((id, i) => {
    if (liked[i]) state.likedIds!.add(id);
    if (favorited[i]) state.favoritedIds!.add(id);
    if (read[i]) state.readIds!.add(id);
  });
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
  let posts = await getFeed();

  if (opts.category) posts = posts.filter((p) => p.category_slug === opts.category);
  if (opts.q) {
    const q = opts.q.toLowerCase();
    posts = posts.filter((p) => String(p.title || "").toLowerCase().includes(q) || String(p.text || "").toLowerCase().includes(q));
  }

  if (viewer) {
    const blocked = new Set((await listKeys(`user_blocks/${viewer.userId}/`)).map((k) => k.split("/")[2]));
    posts = posts.filter((p) => !blocked.has(String(p.author_document_id)));
    if (opts.feed === "following") {
      const follows = new Set((await listKeys(`follows/${viewer.userId}/`)).map((k) => k.split("/")[2]));
      posts = posts.filter((p) => follows.has(String(p.author_document_id)));
    } else if (opts.feed === "favorites") {
      const favs = new Set((await listKeys(`favorites/${viewer.userId}/`)).map((k) => k.split("/")[2]));
      posts = posts.filter((p) => favs.has(String(p.document_id)));
    }
  } else if (opts.feed !== "recommend") {
    return paginated([], opts.start, opts.limit, 0);
  }

  const total = posts.length;
  const page = posts.slice(opts.start, opts.start + opts.limit);
  const state = await viewerState(viewer, page.map((p) => String(p.document_id)));
  const nodes = page.map((p) => toPost(p, state)).filter(Boolean);
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
  const q = (qp.get("q") || "").trim().toLowerCase();
  if (!q) return ok([]);
  const feed = await getFeed();
  const hits = feed
    .filter((p) => String(p.title || "").toLowerCase().includes(q))
    .slice(0, 8)
    .map((p) => ({
      documentId: String(p.document_id),
      title: String(p.title || ""),
      titleHighlighted: String(p.title || ""),
      excerpt: String(p.text || "").slice(0, 60),
      authorName: p.author_name ? String(p.author_name) : null,
      categoryName: p.category_name ? String(p.category_name) : null,
      categorySlug: p.category_slug ? String(p.category_slug) : null,
      isAnonymous: p.is_anonymous === true,
    }));
  return ok(hits);
}

export async function detail(req: Request): Promise<Response> {
  const id = decodeURIComponent(req.url.split("?")[0]!.split("/").filter(Boolean).pop() || "");
  const viewer = await resolveUser(req);
  const doc = await getPostDoc(id);
  if (!doc || doc.status === "deleted") return notFound("帖子不存在");
  if (doc.status !== "published" && doc.status !== "pending") {
    const isOwner = viewer != null && String(doc.author_document_id) === viewer.userId;
    if (!isOwner && viewer?.role !== "admin") return notFound("帖子不存在");
  }
  if (doc.is_hidden === true && viewer?.role !== "admin" && String(doc.author_document_id) !== viewer?.userId) {
    return notFound("帖子不存在");
  }
  const state = await viewerState(viewer, [id]);
  const views = Number(doc.views || 0) + 1;
  await touchPost(id, { views, updated_at: String(doc.updated_at || "") });
  const post = toPost({ ...doc, views }, state);
  return ok(post);
}

export async function view(req: Request): Promise<Response> {
  const segments = req.url.split("?")[0]!.split("/").filter(Boolean);
  const id = decodeURIComponent(segments[segments.length - 2] || "");
  const doc = await getPostDoc(id);
  if (!doc) return notFound();
  const views = Number(doc.views || 0) + 1;
  await touchPost(id, { views, updated_at: String(doc.updated_at || "") });
  return json({ views });
}

async function parseDraftBody(req: Request): Promise<Doc> {
  const body = await readJson<{ data?: Doc }>(req);
  return body.data || {};
}

async function applyBodyToDoc(data: Doc, doc: Doc): Promise<void> {
  if (data.title !== undefined) doc.title = String(data.title).slice(0, 200);
  if (data.text !== undefined) doc.text = String(data.text);
  if (data.editorState !== undefined) doc.editor_state = data.editorState;
  if (data.externalVideos !== undefined) doc.external_videos = Array.isArray(data.externalVideos) ? data.externalVideos : [];
  if (data.isAnonymous !== undefined) doc.is_anonymous = bool(data.isAnonymous);
  if (data.category !== undefined) {
    const cat = await categoryBySlug(String(data.category));
    doc.category_id = cat?.document_id ?? null;
    doc.category_name = cat?.name ?? null;
    doc.category_slug = cat?.slug ?? null;
  }
  if (data.cover !== undefined) {
    const resolved = await resolveCovers(data.cover);
    doc.covers = resolved.covers;
    doc.cover_width = resolved.width ?? null;
    doc.cover_height = resolved.height ?? null;
  }
}

export async function createDraft(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const data = await parseDraftBody(req);
  const documentId = genId();
  const now = new Date().toISOString();
  const cat = await categoryBySlug(typeof data.category === "string" ? data.category : undefined);
  const covers = await resolveCovers(data.cover);

  const doc: Doc = {
    id: documentId,
    document_id: documentId,
    title: String(data.title || "无标题").slice(0, 200),
    text: String(data.text || ""),
    body: "",
    covers: covers.covers,
    cover_width: covers.width ?? null,
    cover_height: covers.height ?? null,
    external_videos: Array.isArray(data.externalVideos) ? data.externalVideos : [],
    editor_state: Array.isArray(data.editorState) ? data.editorState : null,
    status: "draft",
    is_pinned: false,
    is_anonymous: bool(data.isAnonymous),
    is_hidden: false,
    views: 0,
    likes_count: 0,
    comments_count: 0,
    favorites_count: 0,
    created_at: now,
    updated_at: now,
    published_at: null,
    category_id: cat?.document_id ?? null,
    category_name: cat?.name ?? null,
    category_slug: cat?.slug ?? null,
    ...(await authorFields(viewer.userId)),
  };
  await setJson(postKey(documentId), doc);
  await addDraft(viewer.userId, documentId);
  return ok(toDraft(doc));
}

export async function updateDraft(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const id = decodeURIComponent(req.url.split("?")[0]!.split("/").filter(Boolean).pop() || "");
  const doc = await getPostDoc(id);
  if (!doc || doc.status !== "draft" || String(doc.author_document_id) !== viewer.userId) {
    return notFound("草稿不存在");
  }
  const data = await parseDraftBody(req);
  await applyBodyToDoc(data, doc);
  doc.updated_at = new Date().toISOString();
  await setJson(postKey(id), doc);
  return ok(toDraft(doc));
}

function idBeforeAction(req: Request): string {
  const segments = req.url.split("?")[0]!.split("/").filter(Boolean);
  return decodeURIComponent(segments[segments.length - 2] || "");
}

export async function publishDraft(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const id = idBeforeAction(req);
  const doc = await getPostDoc(id);
  if (!doc || doc.status !== "draft" || String(doc.author_document_id) !== viewer.userId) {
    return notFound("草稿不存在");
  }
  // 站点设置「新帖需审核」：开启时发布进入待审队列（pending），不进入信息流
  const settings = (await getJson<Doc>(KEYS.settings)) || {};
  const needAudit = settings.needAudit === true;
  const now = new Date().toISOString();
  const newStatus = needAudit ? "pending" : "published";
  const published: Doc = {
    ...doc,
    status: newStatus,
    published_at: needAudit ? null : now,
    updated_at: now,
    is_hidden: false,
  };
  await setJson(postKey(id), published);
  await removeDraft(viewer.userId, id);
  if (!needAudit) {
    await feedAdd(published);
    await bumpStats({ postCount: 1 });
    await updateUserStats(String(doc.author_document_id), { articleCount: 1 });
  }
  return json({ success: true, status: newStatus });
}

export async function discardDraft(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const id = idBeforeAction(req);
  const doc = await getPostDoc(id);
  if (!doc || doc.status !== "draft" || String(doc.author_document_id) !== viewer.userId) {
    return notFound("草稿不存在");
  }
  await del(postKey(id));
  await removeDraft(viewer.userId, id);
  return json({ success: true });
}

export async function remove(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const id = decodeURIComponent(req.url.split("?")[0]!.split("/").filter(Boolean).pop() || "");
  const doc = await getPostDoc(id);
  if (!doc) return notFound("帖子不存在");
  const isOwner = String(doc.author_document_id) === viewer.userId;

  if (doc.status === "draft") {
    if (!isOwner) return badRequest("无权删除");
    await del(postKey(id));
    await removeDraft(viewer.userId, id);
    return json({ success: true });
  }

  if (!isOwner && viewer.role !== "admin") return badRequest("无权删除");
  const deleted: Doc = { ...doc, status: "deleted", is_hidden: true, updated_at: new Date().toISOString() };
  await setJson(postKey(id), deleted);
  await feedRemove(id);
  await bumpStats({ postCount: -1 });
  await updateUserStats(String(doc.author_document_id), { articleCount: -1 });
  return json({ success: true });
}

export async function myDrafts(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const qp = queryParams(req);
  const start = Math.max(0, int(qp.get("start")));
  const limit = Math.min(50, Math.max(1, int(qp.get("limit"), PAGE_SIZE)));
  const ids = await draftIds(viewer.userId);
  const docs: Doc[] = [];
  for (const id of ids) {
    const d = await getPostDoc(id);
    if (d && d.status === "draft") docs.push(d);
  }
  const page = docs.slice(start, start + limit);
  return paginated(page.map((d) => toDraft(d)), start, limit, docs.length);
}

export async function myDraftDetail(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const id = decodeURIComponent(req.url.split("?")[0]!.split("/").filter(Boolean).pop() || "");
  const doc = await getPostDoc(id);
  if (!doc || doc.status !== "draft" || String(doc.author_document_id) !== viewer.userId) {
    return notFound("草稿不存在");
  }
  return ok(toDraft(doc));
}

export async function triple(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const { articleId } = await readJson<{ articleId?: string }>(req);
  if (!articleId) return badRequest("缺少参数");
  const doc = await getPostDoc(articleId);
  if (!doc) return notFound("帖子不存在");

  let liked = await exists(likeKey(viewer.userId, "article", articleId));
  if (!liked) {
    await setJson(likeKey(viewer.userId, "article", articleId), { liked_at: new Date().toISOString() });
    liked = true;
    await touchPost(articleId, { likes_count: Number(doc.likes_count || 0) + 1 });
  }
  let favorited = await exists(favoriteKey(viewer.userId, articleId));
  if (!favorited) {
    await setJson(favoriteKey(viewer.userId, articleId), { favorited_at: new Date().toISOString() });
    favorited = true;
    await touchPost(articleId, { favorites_count: Number(doc.favorites_count || 0) + 1 });
  }
  const fresh = await getPostDoc(articleId);
  return json({
    liked,
    likesCount: Number(fresh?.likes_count || 0),
    favorited,
    favoritesCount: Number(fresh?.favorites_count || 0),
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
  const now = new Date().toISOString();
  for (const id of ids) {
    if (markAsRead === true) await setJson(readKey(viewer.userId, id), { read_at: now });
    else await del(readKey(viewer.userId, id));
  }
  return json({ success: true });
}
