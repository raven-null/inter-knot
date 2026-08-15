/**
 * Fairy Agent 敏感操作二次确认。
 *
 * 删除/封禁/改设置/处理举报等不可逆或高危操作，首次调用不直接执行：
 * 1. 写入 `_agent/pending/<actionId>.json` 待确认记录（含 actor、工具、参数、TTL）；
 * 2. 工具返回 `requiresConfirmation: true, actionId`；
 * 3. Fairy 向用户复述后果并请求确认；
 * 4. 用户确认后 Fairy 调 `fairy_confirm` 工具，仅创建者、5 分钟内、单次有效才执行。
 */

import { genId, getJson, setJson, del } from "../storage";

const PENDING_PREFIX = "_agent/pending/";
/** 待确认操作有效期 */
export const CONFIRM_TTL_MS = 5 * 60 * 1000;

export interface PendingAction {
  actionId: string;
  /** 创建者用户 documentId（仅本人可确认） */
  actorUserId: string;
  /** 工具名（确认后执行时按此分发） */
  toolName: string;
  /** 工具参数（已裁剪/校验过的） */
  args: Record<string, unknown>;
  createdAt: string;
  expiresAt: string;
  /** 操作描述（Fairy 复述用，如「删除帖子《xxx》」） */
  description: string;
}

const pendingKey = (actionId: string) => `${PENDING_PREFIX}${actionId}.json`;

/** 登记一条待确认操作；返回 actionId */
export async function createPendingAction(
  actorUserId: string,
  toolName: string,
  args: Record<string, unknown>,
  description: string,
): Promise<string> {
  const actionId = genId();
  const now = new Date();
  const pending: PendingAction = {
    actionId,
    actorUserId,
    toolName,
    args,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + CONFIRM_TTL_MS).toISOString(),
    description,
  };
  await setJson(pendingKey(actionId), pending);
  return actionId;
}

/**
 * 确认并领取一条待确认操作。
 * @returns 成功时返回操作（单次有效：读取后立即删除，防止重复执行）；
 *          失败返回 { error }（不存在/过期/非本人）。
 */
export async function claimPendingAction(
  actionId: string,
  actorUserId: string,
): Promise<{ ok: true; pending: PendingAction } | { ok: false; error: string }> {
  if (!actionId) return { ok: false, error: "缺少确认编号" };
  const pending = await getJson<PendingAction>(pendingKey(actionId));
  if (!pending) return { ok: false, error: "确认编号无效或已使用" };
  if (pending.actorUserId !== actorUserId) {
    return { ok: false, error: "该操作只能由发起者确认" };
  }
  if (new Date(pending.expiresAt).getTime() < Date.now()) {
    await del(pendingKey(actionId));
    return { ok: false, error: "确认已过期，请重新发起操作" };
  }
  // 单次有效：先删后执行（若执行失败，用户需重新发起）
  await del(pendingKey(actionId));
  return { ok: true, pending };
}

/** 清理过期待确认操作（可被定时任务调用） */
export async function pruneExpiredPending(): Promise<number> {
  const { listKeys } = await import("../storage");
  const keys = await listKeys(PENDING_PREFIX);
  let removed = 0;
  for (const key of keys) {
    const p = await getJson<PendingAction>(key);
    if (p && new Date(p.expiresAt).getTime() < Date.now()) {
      await del(key);
      removed += 1;
    }
  }
  return removed;
}
