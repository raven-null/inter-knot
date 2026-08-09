/** 通知路由：列表 / 全部已读（基于 Netlify Blobs） */

import { requireAuth } from "../auth";
import { ok, json } from "../http";
import { listNotifications, markAllRead } from "../notify";

/** GET /api/notifications —— 当前用户的通知列表（最新在前） */
export async function list(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const notifs = await listNotifications(viewer.userId);
  const unreadCount = notifs.filter((n) => !n.read).length;
  return json({ data: notifs, unreadCount });
}

/** POST /api/notifications/read-all —— 全部标记已读 */
export async function readAll(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  await markAllRead(viewer.userId);
  return ok({ success: true });
}
