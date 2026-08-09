/** 通知路由：列表 / 全部已读 / 免打扰设置（基于 Netlify Blobs） */

import { requireAuth } from "../auth";
import { ok, json, readJson } from "../http";
import {
  listNotifications,
  markAllRead,
  getNotificationSettings,
  updateNotificationSettings,
  type NotificationSettings,
} from "../notify";

/** GET /api/notifications —— 当前用户的通知列表（最新在前） */
export async function list(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const notifs = await listNotifications(viewer.userId);
  const unreadCount = notifs.filter((n) => !n.read).length;
  const settings = await getNotificationSettings(viewer.userId);
  return json({ data: notifs, unreadCount, settings });
}

/** POST /api/notifications/read-all —— 全部标记已读 */
export async function readAll(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  await markAllRead(viewer.userId);
  return ok({ success: true });
}

/** GET /api/notifications/settings —— 获取免打扰设置 */
export async function getSettings(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const settings = await getNotificationSettings(viewer.userId);
  return json(settings);
}

/** PATCH /api/notifications/settings —— 更新免打扰设置 */
export async function patchSettings(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const patch = await readJson<Partial<NotificationSettings>>(req);
  const settings = await updateNotificationSettings(viewer.userId, patch);
  return json(settings);
}
