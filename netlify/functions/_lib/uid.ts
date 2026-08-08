/** UID 自动生成：为每个用户分配唯一的 8 位数字 UID */

import { getJson, setJson, userKey, userUidKey } from "./storage";
import type { Doc } from "./serialize";

export async function generateUid(): Promise<number> {
  for (let i = 0; i < 100; i += 1) {
    // 8 位数字，10000000 ~ 99999999
    const uid = 10000000 + Math.floor(Math.random() * 90000000);
    const taken = await getJson<unknown>(userUidKey(uid));
    if (!taken) return uid;
  }
  // 极端碰撞兜底：用时间戳末 8 位
  return Number(String(Date.now()).slice(-8));
}

/** 为用户文档写入唯一 uid 并建立索引 */
export async function assignUid(user: Doc): Promise<number> {
  const documentId = String(user.document_id || "");
  const uid = await generateUid();
  await setJson(userKey(documentId), { ...user, uid });
  await setJson(userUidKey(uid), { document_id: documentId });
  return uid;
}
