/** 外围功能桩接口：米游社 / 丁尼 / 签到 / 考试 / 私信 / 在线状态等。
 *  首期论坛核心未实现的功能返回安全的空值，保证前端 UI 不崩溃。 */

import { ok, json, error, readJson } from "../http";

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

/** 敲敲 SSE 实时流（桩）：返回合法的 text/event-stream，避免前端 EventSource 404 报错 */
export function knockStream(): Response {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(": connected\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// ── 在线状态 / 表情 / AI 角色（桩） ─────────────────
/** 在线状态（真实会话追踪）：按 presenceId 记录心跳会话，
 *  登录用户携带用户名/等级/头像与首见时间；超时自动清理。 */
export async function presencePing(req: Request): Promise<Response> {
  const { getJson, setJson, del, listKeys } = await import("../storage");
  const { resolveUser } = await import("../auth");
  const { DEFAULT_AVATAR } = await import("../serialize");
  const body = await readJson<{ presenceId?: string }>(req);
  const presenceId = body.presenceId || "";
  const viewer = await resolveUser(req);
  const now = Date.now();
  const STALE_MS = 45_000; // 45s 无心跳视为离线
  const prefix = "presence/sessions/";

  const keys = await listKeys(prefix);
  const sessions: Record<string, unknown>[] = [];
  for (const key of keys) {
    const s = await getJson<Record<string, unknown>>(key);
    if (!s) continue;
    const last = new Date(String(s.lastSeenAt || "")).getTime();
    if (!Number.isFinite(last) || now - last > STALE_MS) {
      await del(key);
      continue;
    }
    sessions.push(s);
  }

  if (presenceId) {
    const key = `${prefix}${presenceId}.json`;
    const existing = await getJson<Record<string, unknown>>(key);
    let info: Record<string, unknown> = {};
    if (viewer) {
      const u = await getJson<Record<string, unknown>>(`users/${viewer.userId}.json`);
      info = {
        userId: viewer.userId,
        username: viewer.username,
        name: u?.name || viewer.username,
        level: u?.level ?? 1,
        avatar: u?.avatar_url || DEFAULT_AVATAR,
      };
    }
    const session = {
      presenceId,
      ...info,
      joinedAt: existing?.joinedAt || new Date(now).toISOString(),
      lastSeenAt: new Date(now).toISOString(),
    };
    await setJson(key, session);
    sessions.push(session);
  }

  const onlineUsers = sessions
    .filter((s) => !!s.username)
    .map((s) => ({
      username: String(s.username),
      name: String(s.name || s.username),
      level: Number(s.level ?? 1),
      avatar: String(s.avatar || DEFAULT_AVATAR),
      joinedAt: String(s.joinedAt || ""),
      durationSeconds: Math.max(
        0,
        Math.floor((now - new Date(String(s.joinedAt || "")).getTime()) / 1000),
      ),
    }))
    .sort((a, b) => b.durationSeconds - a.durationSeconds);

  return json({
    data: {
      online: sessions.length,
      avatars: sessions.map((s) => String(s.avatar || DEFAULT_AVATAR)).slice(0, 5),
      users: onlineUsers,
    },
  });
}
export function agentCharacters(): Response {
  return ok([]);
}
