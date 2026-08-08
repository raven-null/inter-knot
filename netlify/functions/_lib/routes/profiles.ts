/** 个人主页相关路由（基于 Netlify Blobs） */

import { getJson, listKeys, exists, postKey, commentKey, likeKey, favoriteKey, readKey, blockKey, KEYS } from "../storage";
import { getFeed } from "../feed";
import { resolveUser } from "../auth";
import { ok, paginated, notFound, int, queryParams } from "../http";
import { toPost, toComment, DEFAULT_AVATAR, type Doc, type ViewerState } from "../serialize";

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

  return ok({
    documentId: id,
    userId: id,
    uid: id,
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
    equippedCard: null,
    equippedAvatar: null,
  });
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

  const total = mine.length;
  const page = mine.slice(start, start + limit);
  const state = await viewerState(viewer, page.map((p) => String(p.document_id)));
  return paginated(page.map((p) => toPost(p, state)).filter(Boolean), start, limit, total);
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
  return paginated(page.map((d) => toComment(d, likedIds)).filter(Boolean), start, limit, docs.length);
}
