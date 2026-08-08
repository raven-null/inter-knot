/** 绳网信用（经验）发放：受站点「等级体系」开关控制
 *
 * - 开关开启：写接口通过 awardExp 累计经验并重算等级
 * - 开关关闭：awardExp 为 no-op（不累计、不显示），维持无等级状态
 * - 已产生的 level/exp 字段保留但不展示
 */

import { getJson, setJson, userKey, KEYS } from "./storage";
import type { Doc } from "./serialize";
import { levelFromExp, levelView } from "./level";

/** 当前站点是否开启等级体系 */
export async function showLevelEnabled(): Promise<boolean> {
  const s = await getJson<Doc>(KEYS.settings);
  return s?.showLevel === true;
}

/** 累计经验并重算等级；返回最新等级视图；开关关闭时返回 null（不修改） */
export async function awardExp(
  userId: string,
  amount: number,
): Promise<ReturnType<typeof levelView> | null> {
  if (!(await showLevelEnabled())) return null;
  if (!amount || amount <= 0) return null;
  const user = await getJson<Doc>(userKey(userId));
  if (!user) return null;
  const nextExp = Math.max(0, Number(user.exp || 0) + amount);
  const nextLevel = levelFromExp(nextExp);
  await setJson(userKey(userId), { ...user, exp: nextExp, level: nextLevel });
  return levelView(nextExp);
}
