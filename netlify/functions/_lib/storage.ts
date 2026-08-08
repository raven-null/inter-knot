/**
 * Netlify Blobs 存储层（替代原 Postgres）。
 *
 * - 所有结构化数据以 JSON 文档存于 `data` store
 * - getStore() 在每次调用内部执行（满足 handler 内调用的要求）
 * - 列表/信息流用「索引文档」：`_indexes/feed.json` 维护最新已发布帖子
 */

import { getStore } from "@netlify/blobs";

export const DATA_STORE = "data";

function data(): ReturnType<typeof getStore> {
  return getStore(DATA_STORE);
}

export async function getJson<T>(key: string): Promise<T | null> {
  try {
    const value = await data().get(key, { type: "json", consistency: "strong" });
    return (value ?? null) as T | null;
  } catch {
    return null;
  }
}

export async function setJson(key: string, value: unknown): Promise<void> {
  await data().setJSON(key, value);
}

/** 仅当 key 不存在时写入；返回是否真的写入（用于并发去重/锁） */
export async function setJsonOnce(key: string, value: unknown): Promise<boolean> {
  const res = await data().setJSON(key, value, { onlyIfNew: true });
  return res.modified;
}

export async function del(key: string): Promise<void> {
  try {
    await data().delete(key);
  } catch {
    // 忽略删除不存在的 key
  }
}

/** key 是否已存在（HEAD 请求，用于批量个性化标记） */
export async function exists(key: string): Promise<boolean> {
  try {
    const meta = await data().getMetadata(key, { consistency: "strong" });
    return meta != null;
  } catch {
    return false;
  }
}

/** 列出某前缀下的全部 key（自动翻页） */
export async function listKeys(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  for await (const page of data().list({ prefix, paginate: true })) {
    for (const blob of page.blobs) keys.push(blob.key);
  }
  return keys;
}

// ── ID ───────────────────────────────────────────────
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function genId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let value = 0n;
  for (const b of bytes) value = value * 256n + BigInt(b);
  let out = "";
  while (value > 0n && out.length < 13) {
    out = ALPHABET[Number(value % 62n)] + out;
    value = value / 62n;
  }
  while (out.length < 13) out = "0" + out;
  return out;
}

// ── 文档 key ─────────────────────────────────────────
export const userKey = (id: string) => `users/${id}.json`;
export const userEmailKey = (email: string) => `users/by-email/${email}.json`;
export const userUidKey = (uid: number) => `users/by-uid/${uid}.json`;
export const categoryKey = (id: string) => `categories/${id}.json`;
export const postKey = (id: string) => `posts/${id}.json`;
export const commentKey = (postId: string, id: string) => `comments/${postId}/${id}.json`;
export const likeKey = (viewer: string, targetType: string, targetId: string) => `likes/${viewer}/${targetType}/${targetId}.json`;
export const favoriteKey = (viewer: string, postId: string) => `favorites/${viewer}/${postId}.json`;
export const followKey = (viewer: string, target: string) => `follows/${viewer}/${target}.json`;
export const blockKey = (viewer: string, target: string) => `user_blocks/${viewer}/${target}.json`;
export const readKey = (viewer: string, postId: string) => `read_records/${viewer}/${postId}.json`;
export const reportKey = (viewer: string, targetType: string, targetId: string) => `reports/${viewer}/${targetType}/${targetId}.json`;
export const uploadKey = (hash: string) => `uploads/${hash}.json`;
export const codeKey = (purpose: string, email: string) => `verification_codes/${purpose}/${email}.json`;

export const KEYS = {
  settings: "settings.json",
  stats: "stats.json",
  feed: "_indexes/feed.json",
  drafts: (userId: string) => `_indexes/drafts/${userId}.json`,
  userComments: (userId: string) => `_indexes/user-comments/${userId}.json`,
  commentLookup: (commentId: string) => `_indexes/comment-lookup/${commentId}.json`,
};
