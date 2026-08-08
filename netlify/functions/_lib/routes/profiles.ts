/** 个人主页相关路由（基于 Netlify Blobs） */

import { getJson, listKeys, exists, postKey, commentKey, likeKey, favoriteKey, readKey, blockKey, KEYS } from "../storage";
import { getFeed } from "../feed";
import { resolveUser } from "../auth";
import { ok, paginated, notFound, int, queryParams } from "../http";
import { toPost, toComment, DEFAULT_AVATAR, hydrateAuthorLevels, type Doc, type ViewerState } from "../serialize";

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

export async function detail(req: Request): Promise<Response> {
  const id = decodeURIComponent(req.url.split("?")[0]!.split("/").filter(Boolean).pop() || "");
  const viewer = await resolveUser(req);
  const user = await getJson<Doc>(`users/${id}.json`);
  if (!user) return notFound("用户不存在");
  const isSelf = viewer != null && viewer.userId === id;

  const [isFollowing, isBlockedByMe, hasBlockedMe] = viewer
    ? await Promise.all([
        exists(`follows/${viewer.userId}/${id}.json`),
        exists(blockKey(viewer.userId, id)),
        exists(blockKey(id, viewer.userId)),
      ])
    : [false, false, false];

  const feed = await getFeed();
  const mine = feed.filter((p) => String(p.author_document_id) === id);

  // 解析该用户装备的自定义背景图
  const bgIdx = await getJson<{
    items?: Array<{ documentId: string; url: string; name?: string }>;
    equippedDocumentId?: string | null;
  }>(KEYS.customBackgrounds(id));
  const equippedBg = bgIdx?.items?.find((it) => it.documentId === bgIdx.equippedDocumentId);

  return ok({
    documentId: id,
    userId: Number(user.uid || 0),
    uid: Number(user.uid || 0),
    login: String(user.username || ""),
    name: String(user.name || user.username || ""),
    bio: String(user.bio || ""),
    avatar: String(user.avatar_url || DEFAULT_AVATAR),
    level: Number(user.level || 1),
    exp: Number(user.exp || 0),
    isSelf,
    isHidden: false,
    profileHidden: user.profile_hidden === true,
    isAiAgent: false,
    isBlockedByMe,
    hasBlockedMe,
    isFollowing,
    followersCount: Number(user.followersCount || 0),
    followingCount: Number(user.followingCount || 0),
    stats: {
      articleCount: mine.length,
      commentCount: Number((user.stats as Doc)?.commentCount || 0),
      totalViews: mine.reduce((s, p) => s + Number(p.views || 0), 0),
      totalComments: mine.reduce((s, p) => s + Number(p.comments_count || 0), 0),
      totalLikes: mine.reduce((s, p) => s + Number(p.likes_count || 0), 0),
    },
    equippedCard: equippedBg
      ? {
          documentId: equippedBg.documentId,
          name: equippedBg.name || "自定义背景",
          type: "character",
          image: equippedBg.url,
        }
      : null,
    equippedAvatar: null,
  });
}

/** 收藏夹：仅本人可看，按收藏时间倒序 */
export async function favorites(req: Request): Promise<Response> {
  const segments = req.url.split("?")[0]!.split("/").filter(Boolean);
  const id = decodeURIComponent(segments[segments.length - 2] || "");
  const qp = queryParams(req);
  const start = Math.max(0, int(qp.get("start")));
  const limit = Math.min(50, Math.max(1, int(qp.get("limit"), 20)));
  const viewer = await resolveUser(req);
  if (!viewer || viewer.userId !== id) return notFound("资源不存在");

  const keys = await listKeys(`favorites/${id}/`);
  const byId = new Map(keys.map((k) => [k.split("/")[2].replace(/\.json$/, ""), k]));
  const feed = await getFeed();
  const withTime: Array<{ doc: Doc; at: string }> = [];
  for (const p of feed) {
    const key = byId.get(String(p.document_id));
    if (!key) continue;
    const fav = await getJson<Doc>(key);
    withTime.push({ doc: p, at: String(fav?.created_at || "") });
  }
  withTime.sort((a, b) => b.at.localeCompare(a.at));

  const total = withTime.length;
  const page = withTime.slice(start, start + limit).map((w) => w.doc);
  const state = await viewerState(viewer, page.map((p) => String(p.document_id)));
  const hydrated = await hydrateAuthorLevels(page);
  return paginated(hydrated.map((p) => toPost(p, state)).filter(Boolean), start, limit, total);
}

/** 历史阅读：仅本人可看，按阅读时间倒序 */
export async function history(req: Request): Promise<Response> {
  const segments = req.url.split("?")[0]!.split("/").filter(Boolean);
  const id = decodeURIComponent(segments[segments.length - 2] || "");
  const qp = queryParams(req);
  const start = Math.max(0, int(qp.get("start")));
  const limit = Math.min(50, Math.max(1, int(qp.get("limit"), 20)));
  const viewer = await resolveUser(req);
  if (!viewer || viewer.userId !== id) return notFound("资源不存在");

  const keys = await listKeys(`read_records/${id}/`);
  const byId = new Map(keys.map((k) => [k.split("/")[2].replace(/\.json$/, ""), k]));
  const feed = await getFeed();
  const withTime: Array<{ doc: Doc; at: string }> = [];
  for (const p of feed) {
    const key = byId.get(String(p.document_id));
    if (!key) continue;
    const rec = await getJson<Doc>(key);
    withTime.push({ doc: p, at: String(rec?.read_at || "") });
  }
  withTime.sort((a, b) => b.at.localeCompare(a.at));

  const total = withTime.length;
  const page = withTime.slice(start, start + limit).map((w) => w.doc);
  const state = await viewerState(viewer, page.map((p) => String(p.document_id)));
  const hydrated = await hydrateAuthorLevels(page);
  return paginated(hydrated.map((p) => toPost(p, state)).filter(Boolean), start, limit, total);
}

export async function articles(req: Request): Promise<Response> {
  const segments = req.url.split("?")[0]!.split("/").filter(Boolean);
  const id = decodeURIComponent(segments[segments.length - 2] || "");
  const qp = queryParams(req);
  const start = Math.max(0, int(qp.get("start")));
  const limit = Math.min(50, Math.max(1, int(qp.get("limit"), 20)));
  const viewer = await resolveUser(req);

  const user = await getJson<Doc>(`users/${id}.json`);
  if (!user) return notFound("用户不存在");

  let mine = (await getFeed()).filter((p) => String(p.author_document_id) === id);
  if (viewer) {
    const blocked = new Set((await listKeys(`user_blocks/${viewer.userId}/`)).map((k) => k.split("/")[2]));
    mine = mine.filter((p) => !blocked.has(String(p.author_document_id)));
  }

  // 精选展示：作者配置了 pinned_articles 时，按配置顺序把精选帖子排到最前
  const pinnedRaw = user.pinned_articles;
  if (Array.isArray(pinnedRaw)) {
    const pinnedIds = (pinnedRaw as unknown[]).filter((x): x is string => typeof x === "string");
    const byId = new Map(mine.map((p) => [String(p.document_id), p]));
    const pinnedDocs: Doc[] = [];
    for (const pid of pinnedIds) {
      const doc = byId.get(pid);
      if (doc) pinnedDocs.push(doc);
    }
    const pinnedSet = new Set(pinnedDocs.map((p) => String(p.document_id)));
    mine = [...pinnedDocs, ...mine.filter((p) => !pinnedSet.has(String(p.document_id)))];
  }

  const total = mine.length;
  const page = mine.slice(start, start + limit);
  const state = await viewerState(viewer, page.map((p) => String(p.document_id)));
  const hydrated = await hydrateAuthorLevels(page);
  return paginated(hydrated.map((p) => toPost(p, state)).filter(Boolean), start, limit, total);
}

export async function comments(req: Request): Promise<Response> {
  const segments = req.url.split("?")[0]!.split("/").filter(Boolean);
  const id = decodeURIComponent(segments[segments.length - 2] || "");
  const qp = queryParams(req);
  const start = Math.max(0, int(qp.get("start")));
  const limit = Math.min(50, Math.max(1, int(qp.get("limit"), 20)));
  const viewer = await resolveUser(req);

  const user = await getJson<Doc>(`users/${id}.json`);
  if (!user) return notFound("用户不存在");

  const keys = (await getJson<string[]>(KEYS.userComments(id))) ?? [];
  const docs: Doc[] = [];
  for (const key of keys) {
    const d = await getJson<Doc>(key);
    if (d) docs.push(d);
  }
  docs.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));

  const page = docs.slice(start, start + limit);
  const pageIds = new Set(page.map((d) => String(d.document_id)));
  const likedIds = new Set<string>();
  if (viewer) {
    const likeKeys = await listKeys(`likes/${viewer.userId}/comment/`);
    for (const k of likeKeys) {
      const cid = k.split("/")[3];
      if (pageIds.has(cid)) likedIds.add(cid);
    }
  }
  const hydrated = await hydrateAuthorLevels(page);
  return paginated(hydrated.map((d) => toComment(d, likedIds)).filter(Boolean), start, limit, docs.length);
}
