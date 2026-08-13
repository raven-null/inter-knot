/** 外围功能桩接口：丁尼 / 签到 / 考试 / 私信 / 在线状态等。
 *  首期论坛核心未实现的功能返回安全的空值，保证前端 UI 不崩溃。 */

import { ok, json, readJson } from "../http";

// ── 敲敲（桩） ───────────────────────────────
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
 *  登录用户携带用户名/头像与首见时间；超时自动清理。 */
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
  const sessionMap = new Map<string, Record<string, unknown>>();
  for (const key of keys) {
    const s = await getJson<Record<string, unknown>>(key);
    if (!s) continue;
    const last = new Date(String(s.lastSeenAt || "")).getTime();
    if (!Number.isFinite(last) || now - last > STALE_MS) {
      await del(key);
      continue;
    }
    sessionMap.set(key, s);
  }

  if (presenceId) {
    const key = `${prefix}${presenceId}.json`;
    const existing = sessionMap.get(key);
    let info: Record<string, unknown> = {};
    if (viewer) {
      const u = await getJson<Record<string, unknown>>(`users/${viewer.userId}.json`);
      info = {
        userId: viewer.userId,
        uid: Number(u?.uid || 0),
        username: viewer.username,
        name: u?.name || viewer.username,
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
    // 已存在的会话原地更新，避免同一会话在列表中重复出现
    sessionMap.set(key, session);
  }

  const sessions = [...sessionMap.values()];

  // 在线用户按账号去重：同一账号多设备/多标签页只计 1 人（匿名会话不进入列表）。
  const seenUsers = new Set<string>();
  const onlineUsers = sessions
    .filter((s) => {
      if (!s.username) return false;
      const key = String(s.userId || s.username);
      if (seenUsers.has(key)) return false;
      seenUsers.add(key);
      return true;
    })
    .map((s) => ({
      userId: Number(s.uid || 0),
      username: String(s.username),
      name: String(s.name || s.username),
      avatar: String(s.avatar || DEFAULT_AVATAR),
      joinedAt: String(s.joinedAt || ""),
      durationSeconds: Math.max(
        0,
        Math.floor((now - new Date(String(s.joinedAt || "")).getTime()) / 1000),
      ),
    }))
    .sort((a, b) => b.durationSeconds - a.durationSeconds);

  // 在线人数与列表口径一致：只统计登录用户（匿名访客不计入显示人数）。
  const online = onlineUsers.length;
  const avatars = sessions
    .filter((s) => !!s.avatar)
    .map((s) => String(s.avatar || DEFAULT_AVATAR))
    .slice(0, 5);

  return json({
    data: {
      online,
      avatars,
      users: onlineUsers,
    },
  });
}
