/**
 * Fairy Agent 速率限制（blob 令牌桶）。
 *
 * 目标：防止 AI 对话被刷（GLM 每次调用都烧钱），也防止管理工具被滥用。
 *
 * 实现：
 * - 每用户每小时配额：普通用户 N 次工具执行，管理员 M 次；
 * - 敏感操作（删除类）独立配额，更严格；
 * - 全局 GLM 每日调用预算（防总烧钱）。
 *
 * 存储：`_rate/fairy/<kind>/<key>/<yyyy-mm-dd-hh>.json` 存 { count }。
 * 配额是尽力而为的软限制（blob 读改写无 CAS，并发下可能轻微超限，可接受）。
 */

import { getJson, setJson } from "../storage";

const RATE_PREFIX = "_rate/fairy/";

/** 普通用户每小时工具执行上限 */
export const USER_TOOL_LIMIT_PER_HOUR = 30;
/** 管理员每小时工具执行上限 */
export const ADMIN_TOOL_LIMIT_PER_HOUR = 120;
/** 敏感操作（删除/封禁/改设置）每小时上限（不分角色） */
export const SENSITIVE_TOOL_LIMIT_PER_HOUR = 10;
/** 全站 GLM 每日调用预算（防烧钱；超出后 Agent 降级为纯聊天不调工具） */
export const GLM_DAILY_BUDGET = 500;

function hourBucket(date: Date): string {
  return date.toISOString().slice(0, 13); // yyyy-mm-ddThh
}

function dayBucket(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function getCount(key: string): Promise<number> {
  const doc = await getJson<{ count?: number }>(key);
  return Number(doc?.count || 0);
}

async function bumpCount(key: string): Promise<number> {
  const next = (await getCount(key)) + 1;
  await setJson(key, { count: next });
  return next;
}

/**
 * 检查并占用一次配额。
 * @returns 是否允许执行；不允许时返回 { allowed:false, remaining }。
 */
export async function consumeToolQuota(
  userId: string,
  isAdmin: boolean,
  sensitive: boolean,
): Promise<{ allowed: boolean; remaining: number }> {
  const now = new Date();
  const bucket = hourBucket(now);
  const key = `${RATE_PREFIX}tool/${encodeURIComponent(userId)}/${bucket}.json`;
  const limit = sensitive
    ? SENSITIVE_TOOL_LIMIT_PER_HOUR
    : isAdmin
      ? ADMIN_TOOL_LIMIT_PER_HOUR
      : USER_TOOL_LIMIT_PER_HOUR;

  const used = await bumpCount(key);
  if (used > limit) {
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining: Math.max(0, limit - used) };
}

/**
 * 检查并占用一次 GLM 调用预算（全站级）。
 * @returns 是否允许继续调用 GLM。
 */
export async function consumeGlmBudget(): Promise<boolean> {
  const bucket = dayBucket(new Date());
  const key = `${RATE_PREFIX}glm/${bucket}.json`;
  const used = await bumpCount(key);
  return used <= GLM_DAILY_BUDGET;
}

/** 当前用户剩余配额（用于 Fairy 回复里提示"今日额度快用完"） */
export async function toolQuotaRemaining(
  userId: string,
  isAdmin: boolean,
): Promise<number> {
  const bucket = hourBucket(new Date());
  const key = `${RATE_PREFIX}tool/${encodeURIComponent(userId)}/${bucket}.json`;
  const used = await getCount(key);
  const limit = isAdmin ? ADMIN_TOOL_LIMIT_PER_HOUR : USER_TOOL_LIMIT_PER_HOUR;
  return Math.max(0, limit - used);
}
