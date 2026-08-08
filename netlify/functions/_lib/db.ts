/** Netlify Database 访问封装（v2 函数内调用 getDatabase） */

import { getDatabase } from "@netlify/database";

/** 数据库客户端；必须在 handler 内部调用，不在模块顶层缓存 */
export function db() {
  return getDatabase();
}

/** 生成对外暴露的稳定 ID（base62，13 位） */
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
