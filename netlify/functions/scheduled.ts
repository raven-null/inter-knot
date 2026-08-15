/**
 * 定时任务（Netlify Scheduled Functions）
 *
 * 用途：
 * - 清理过期的敏感操作待确认记录（_agent/pending/*，TTL 5 分钟）
 * - 清理 30 天前的审计日志（_agent/audit/*）
 * - 清理孤儿上传元数据（可选，保守起见不做删除，只统计）
 *
 * 触发：netlify.toml 中 [functions."scheduled"] schedule = "0 * * * *"（每小时）
 * 注意：该函数路径必须独立，不能走 /api/* catch-all。
 */

import type { Config, Context } from "@netlify/functions";
import { listKeys, getJson, del } from "./_lib/storage";

const PENDING_PREFIX = "_agent/pending/";
const AUDIT_PREFIX = "_agent/audit/";
/** 审计日志保留天数 */
const AUDIT_RETENTION_DAYS = 30;

export default async (_req: Request, context: Context): Promise<Response> => {
  const startedAt = Date.now();
  let pendingRemoved = 0;
  let auditRemoved = 0;

  // 1) 清理过期待确认记录
  const pendingKeys = await listKeys(PENDING_PREFIX);
  const now = Date.now();
  for (const key of pendingKeys) {
    const doc = await getJson<{ expiresAt?: string }>(key);
    if (doc && new Date(doc.expiresAt || 0).getTime() < now) {
      await del(key);
      pendingRemoved += 1;
    }
  }

  // 2) 清理超期审计日志（按日期目录前缀删除）
  const cutoff = new Date(now - AUDIT_RETENTION_DAYS * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  const auditKeys = await listKeys(AUDIT_PREFIX);
  for (const key of auditKeys) {
    // key 形如 _agent/audit/<userId>/<yyyy-mm-dd>/<id>.json
    const parts = key.split("/");
    const date = parts[parts.length - 2];
    if (typeof date === "string" && date < cutoff) {
      await del(key);
      auditRemoved += 1;
    }
  }

  const elapsed = Date.now() - startedAt;
  return new Response(
    JSON.stringify({
      ok: true,
      elapsedMs: elapsed,
      pendingRemoved,
      auditRemoved,
      scanned: { pending: pendingKeys.length, audit: auditKeys.length },
    }),
    {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    },
  );
};

export const config: Config = {
  schedule: "0 * * * *",
};
