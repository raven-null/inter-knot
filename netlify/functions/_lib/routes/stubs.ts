/** 外围功能桩接口：米游社 / 丁尼 / 签到 / 考试 / 私信 / 在线状态等。
 *  首期论坛核心未实现的功能返回安全的空值，保证前端 UI 不崩溃。 */

import { ok, json, error } from "../http";

// ── 米游社扫码（未实现：返回明确提示，前端展示为暂未开放） ──
export function mihoyoQrCreate(): Response {
  return error(
    501,
    "米游社登录暂未开放，请使用邮箱注册或登录",
    "MIHOYO_NOT_SUPPORTED",
  );
}
export function mihoyoQrStatus(): Response {
  return json({ status: "expired" });
}
export function mihoyoBinding(): Response {
  return json({ binding: null });
}
export function mihoyoUnbind(): Response {
  return json({ success: true });
}

// ── 丁尼货币（桩） ──────────────────────────────────
export function denny(): Response {
  return json({ denny: 0, dennyGiven: 0, recentLogs: [] });
}
export function dennyGive(): Response {
  return json({ success: true, newBalance: 0, articleDennyCount: 0 });
}

// ── 签到（桩） ──────────────────────────────────────
export function checkInStatus(): Response {
  return json({ canCheckIn: false, totalDays: 0, consecutiveDays: 0, rank: 0, nextEligibleAt: null });
}
export function checkIn(): Response {
  return json({
    message: "签到功能暂未开放",
    reward: 0,
    dennyAdded: 0,
    currentDenny: 0,
    consecutiveDays: 0,
    totalDays: 0,
    rank: 0,
  });
}

// ── 等级权益（桩） ──────────────────────────────────
export function benefitsMe(): Response {
  return json({
    level: 1,
    maxLevel: 60,
    benefits: { articleMaxImages: 9, commentMaxImages: 9, articleMaxBody: 100000 },
    nextLevel: undefined,
  });
}

// ── 入站考试（桩：默认已通过） ──────────────────────
const EXAM_CONFIG = {
  questionCount: 10,
  passScorePercent: 60,
  timeLimitSeconds: 600,
  maxFailsBeforeCooldown: 3,
  failCooldownSeconds: 3600,
  rewardDenny: 0,
  rewardExp: 0,
};
export function examStatus(): Response {
  return json({ passed: true, passedAt: new Date().toISOString(), config: EXAM_CONFIG });
}
export function examStart(): Response {
  return json({ attemptId: "", resumed: false, startedAt: "", expiresAt: "", questions: [], config: EXAM_CONFIG });
}
export function examSubmit(): Response {
  return json({
    passed: true,
    score: 100,
    totalScore: 100,
    scorePercent: 100,
    correctCount: 10,
    questionCount: 10,
    passScorePercent: 60,
    cooldownRemaining: 0,
    reward: null,
  });
}
export function examReview(): Response {
  return json({
    attemptId: "",
    passed: true,
    score: 100,
    totalScore: 100,
    scorePercent: 100,
    correctCount: 10,
    questionCount: 10,
    submittedAt: new Date().toISOString(),
    config: EXAM_CONFIG,
    questions: [],
  });
}

// ── 私信 / 敲敲（桩） ───────────────────────────────
export function dmConversations(): Response {
  return ok([]);
}
export function dmDirect(): Response {
  return json({ data: null, isNew: false });
}
export function dmAiSession(): Response {
  return json({ data: null, isNew: false });
}
export function dmReadAll(): Response {
  return json({ success: true });
}
export function dmAiAction(): Response {
  return json({ success: true });
}
export function dmSocketTicket(): Response {
  return json({ ticket: "" });
}
export function knockConversations(): Response {
  return ok([]);
}

// ── 在线状态 / 表情 / AI 角色（桩） ─────────────────
export function presencePing(): Response {
  return json({ data: { online: 1, avatars: [] } });
}
export function emotesManifest(): Response {
  return json({ groups: [], emotes: [] });
}
export function agentCharacters(): Response {
  return ok([]);
}
