/** 信息流索引（_indexes/feed.json）与全局统计（stats.json）辅助 */

import { getJson, setJson, KEYS, userKey } from "./storage";
import type { Doc } from "./serialize";

const FEED_CAP = 1000;

export async function getFeed(): Promise<Doc[]> {
  const feed = await getJson<{ posts?: Doc[] }>(KEYS.feed);
  return Array.isArray(feed?.posts) ? (feed.posts as Doc[]) : [];
}

export async function saveFeed(posts: Doc[]): Promise<void> {
  await setJson(KEYS.feed, { posts });
}

export async function feedAdd(doc: Doc): Promise<void> {
  const posts = await getFeed();
  posts.unshift(doc);
  if (posts.length > FEED_CAP) posts.length = FEED_CAP;
  await saveFeed(posts);
}

export async function feedRemove(documentId: string): Promise<void> {
  const posts = await getFeed();
  const next = posts.filter((p) => p.document_id !== documentId);
  if (next.length !== posts.length) await saveFeed(next);
}

/** 存在则更新，不存在则插入到最前（发布/上架用） */
export async function feedUpsert(doc: Doc): Promise<void> {
  const posts = await getFeed();
  const id = String(doc.document_id);
  const idx = posts.findIndex((p) => p.document_id === id);
  if (idx >= 0) {
    posts[idx] = { ...posts[idx], ...doc };
  } else {
    posts.unshift(doc);
  }
  if (posts.length > FEED_CAP) posts.length = FEED_CAP;
  await saveFeed(posts);
}

export async function feedUpdate(documentId: string, patch: Doc): Promise<void> {
  const posts = await getFeed();
  let changed = false;
  const next = posts.map((p) => {
    if (p.document_id === documentId) {
      changed = true;
      return { ...p, ...patch };
    }
    return p;
  });
  if (changed) await saveFeed(next);
}

export async function getStats(): Promise<Record<string, number>> {
  const s = await getJson<Record<string, number>>(KEYS.stats);
  return s ?? {};
}

export async function bumpStats(patch: Record<string, number>): Promise<void> {
  const s = await getStats();
  for (const [k, v] of Object.entries(patch)) {
    s[k] = Number(s[k] || 0) + v;
  }
  await setJson(KEYS.stats, s);
}

/** 读取用户文档 */
export async function getUser(docId: string): Promise<Doc | null> {
  return getJson<Doc>(userKey(docId));
}

/** 更新用户聚合统计（delta 累加）：articleCount / commentCount / totalViews / totalLikes / totalComments */
export async function updateUserStats(userId: string, delta: Record<string, number>): Promise<void> {
  const u = await getUser(userId);
  if (!u) return;
  const stats = (u.stats as Doc) || {};
  for (const [k, v] of Object.entries(delta)) {
    stats[k] = Math.max(0, Number(stats[k] || 0) + v);
  }
  await setJson(userKey(userId), { ...u, stats });
}

/** 更新用户计数（followersCount / followingCount，delta 累加） */
export async function updateUserCounts(userId: string, delta: Record<string, number>): Promise<void> {
  const u = await getUser(userId);
  if (!u) return;
  const next: Doc = { ...u };
  for (const [k, v] of Object.entries(delta)) {
    next[k] = Math.max(0, Number(next[k] || 0) + v);
  }
  await setJson(userKey(userId), next);
}
