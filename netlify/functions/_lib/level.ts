/** 绳网等级体系（后端权威）：累计绳网信用（exp）→ 等级 */

export const LEVEL_THRESHOLDS = [0, 500, 2000, 6000, 15000, 35000, 80000] as const;

export const MAX_LEVEL = LEVEL_THRESHOLDS.length;

export const LEVEL_TITLES: Record<number, string> = {
  1: "新手绳匠",
  2: "见习绳匠",
  3: "正式绳匠",
  4: "资深绳匠",
  5: "精英绳匠",
  6: "传奇绳匠",
  7: "传说绳匠",
};

/** 按累计经验计算等级（1 起步） */
export function levelFromExp(exp: number): number {
  const value = Math.max(0, Math.floor(exp) || 0);
  let level = 1;
  for (let i = 0; i < MAX_LEVEL; i += 1) {
    if (value >= (LEVEL_THRESHOLDS[i] ?? 0)) level = i + 1;
  }
  return level;
}

/** 当前等级已累计经验的起点门槛 */
export function levelThreshold(level: number): number {
  const l = Math.min(Math.max(level, 1), MAX_LEVEL);
  return LEVEL_THRESHOLDS[l - 1] ?? 0;
}

/** 当前等级升到下一级所需的总经验（满级返回当前门槛，用于显示 100%） */
export function nextLevelThreshold(level: number): number {
  const l = Math.min(Math.max(level, 1), MAX_LEVEL);
  if (l >= MAX_LEVEL) return LEVEL_THRESHOLDS[MAX_LEVEL - 1] ?? 0;
  return LEVEL_THRESHOLDS[l] ?? LEVEL_THRESHOLDS[MAX_LEVEL - 1] ?? 0;
}

/** 返回用户展示所需的等级视图 */
export function levelView(exp: number): { level: number; title: string; exp: number; currentThreshold: number; nextThreshold: number; progressPercent: number } {
  const e = Math.max(0, Math.floor(exp) || 0);
  const level = levelFromExp(e);
  const currentThreshold = levelThreshold(level);
  const nextThreshold = nextLevelThreshold(level);
  const span = nextThreshold - currentThreshold;
  const gained = e - currentThreshold;
  const progressPercent = span > 0 ? Math.min(100, Math.max(0, Math.round((gained / span) * 100))) : 100;
  return {
    level,
    title: LEVEL_TITLES[level] ?? "",
    exp: e,
    currentThreshold,
    nextThreshold,
    progressPercent,
  };
}
