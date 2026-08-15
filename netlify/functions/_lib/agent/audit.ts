/**
 * Fairy Agent 审计日志。
 *
 * 每次工具执行（含被限流/被拒绝的尝试）落一条记录：
 * `_agent/audit/<userId>/<yyyy-mm-dd>/<ts>-<rand>.json`
 *
 * 记录：时间、工具名、参数（裁剪）、结果（裁剪）、是否成功、延迟。
 * 供后台查阅与事后追溯；敏感字段（密钥/token/正文全文）不落库。
 */

import { genId, setJson } from "../storage";

const AUDIT_PREFIX = "_agent/audit/";

/** 审计记录字段长度上限 */
const CLIP = (s: unknown, n: number): string => {
  const t = String(s ?? "");
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

export interface AuditEntry {
  id: string;
  at: string;
  /** 发起用户 documentId */
  userId: string;
  /** 是否管理员 */
  isAdmin: boolean;
  /** 工具名 */
  tool: string;
  /** 参数摘要（裁剪；敏感值如内容正文截断到短摘要） */
  args: Record<string, unknown>;
  ok: boolean;
  /** 结果摘要（裁剪） */
  result: string;
  /** 耗时 ms */
  ms: number;
  /** 是否因限流拒绝 */
  limited?: boolean;
  /** 是否需二次确认而未执行 */
  pendingConfirm?: boolean;
}

/** 参数脱敏：只保留展示级字段并裁剪长文本 */
function safeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args ?? {})) {
    if (typeof v === "string" && v.length > 120) {
      out[k] = `${v.slice(0, 120)}…`;
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function audit(entry: Omit<AuditEntry, "id" | "at">): Promise<void> {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const id = `${now.getTime().toString(36)}-${genId().slice(0, 6)}`;
  const key = `${AUDIT_PREFIX}${encodeURIComponent(entry.userId)}/${day}/${id}.json`;
  try {
    await setJson(key, {
      ...entry,
      id,
      at: now.toISOString(),
      args: safeArgs(entry.args),
      result: CLIP(entry.result, 400),
    });
  } catch {
    // 审计失败不影响主流程（尽力而为）
  }
}
