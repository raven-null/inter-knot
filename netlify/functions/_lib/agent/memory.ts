/**
 * Fairy 长期记忆：记住用户显式告知的偏好/信息，跨会话生效。
 *
 * 存储：`_agent/memory/<userId>.json` → { items: [{ text, at }] }
 * 上限 20 条，超出丢最旧；只记录用户主动告知的内容（fairy_memorize 工具），
 * Fairy 不主动套问隐私，也不在回复中复述记忆原文。
 */

import { getJson, setJson } from "../storage";

const MEMORY_PREFIX = "_agent/memory/";
const MEMORY_MAX = 20;

interface MemoryDoc {
  items: Array<{ text: string; at: string }>;
}

const memoryKey = (userId: string) => `${MEMORY_PREFIX}${encodeURIComponent(userId)}.json`;

async function loadMemory(userId: string): Promise<MemoryDoc> {
  const doc = await getJson<MemoryDoc>(memoryKey(userId));
  return doc ?? { items: [] };
}

/** 读取用户记忆文本列表（供 system prompt 注入） */
export async function getMemoryTexts(userId: string): Promise<string[]> {
  const doc = await loadMemory(userId);
  return doc.items.map((i) => i.text).filter(Boolean);
}

/** 写入一条记忆；返回当前记忆条数 */
export async function addMemory(userId: string, text: string): Promise<number> {
  const clean = String(text || "").trim().slice(0, 300);
  if (!clean) return 0;
  const doc = await loadMemory(userId);
  const items = [...doc.items.filter((i) => i.text !== clean), { text: clean, at: new Date().toISOString() }];
  if (items.length > MEMORY_MAX) items.splice(0, items.length - MEMORY_MAX);
  await setJson(memoryKey(userId), { items });
  return items.length;
}

/** 删除一条记忆（按文本精确匹配）；返回是否删除 */
export async function removeMemory(userId: string, text: string): Promise<boolean> {
  const clean = String(text || "").trim();
  if (!clean) return false;
  const doc = await loadMemory(userId);
  const items = doc.items.filter((i) => i.text !== clean);
  if (items.length === doc.items.length) return false;
  await setJson(memoryKey(userId), { items });
  return true;
}

/** 清空全部记忆 */
export async function clearMemory(userId: string): Promise<void> {
  await setJson(memoryKey(userId), { items: [] });
}
