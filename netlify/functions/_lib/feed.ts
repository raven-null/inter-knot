/** 信息流索引（_indexes/feed.json）与全局统计（stats.json）辅助
 *
 * feed 更新采用「读-改-写 + etag 条件写（CAS）+ 重试」保证原子性，
 * 避免并发发布/删除/计数时读-改-写竞态导致丢更新或旧数据回写覆盖。
 */

import { getJson, setJson, setJsonOnce, getJsonWithEtag, setJsonIfMatch, userKey, KEYS } from "./storage";
import type { Doc } from "./serialize";

const FEED_CAP = 1000;

export async function getFeed(): Promise<Doc[]> {
  const feed = await getJson<{ posts?: Doc[] }>(KEYS.feed);
  return Array.isArray(feed?.posts) ? (feed.posts as Doc[]) : [];
}

export async function saveFeed(posts: Doc[]): Promise<void> {
  await setJson(KEYS.feed, { posts });
}

/** 原子化地修改 feed 索引（CAS + 重试） */
async function mutateFeed(mutate: (posts: Doc[]) => Doc[]): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const cur = await getJsonWithEtag<{ posts?: Doc[] }>(KEYS.feed);
    if (!cur) {
      // feed 尚不存在：直接写入（正常由 ensureSeed 预建，这里是兜底）
      await setJson(KEYS.feed, { posts: mutate([]) });
      return;
    }
    const posts = Array.isArray(cur.data?.posts) ? (cur.data.posts as Doc[]) : [];
    const next = mutate(posts);
    const ok = await setJsonIfMatch(KEYS.feed, { posts: next }, cur.etag);
    if (ok) return;
    // etag 冲突：其它实例已写入，重读重试
  }
}

export async function feedAdd(doc: Doc): Promise<void> {
  await mutateFeed((posts) => {
    const next = [doc, ...posts];
    if (next.length > FEED_CAP) next.length = FEED_CAP;
    return next;
  });
}

export async function feedRemove(documentId: string): Promise<void> {
  await mutateFeed((posts) => posts.filter((p) => p.document_id !== documentId));
}

export async function feedUpdate(documentId: string, patch: Doc): Promise<void> {
  await mutateFeed((posts) =>
    posts.map((p) => (p.document_id === documentId ? { ...p, ...patch } : p)),
  );
}

/** 存在则更新，不存在则插入到最前（发布/上架用） */
export async function feedUpsert(doc: Doc): Promise<void> {
  await mutateFeed((posts) => {
    const idx = posts.findIndex((p) => p.document_id === doc.document_id);
    const next = idx >= 0 ? posts.map((p, i) => (i === idx ? { ...p, ...doc } : p)) : [doc, ...posts];
    if (next.length > FEED_CAP) next.length = FEED_CAP;
    return next;
  });
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

export { setJsonOnce };
