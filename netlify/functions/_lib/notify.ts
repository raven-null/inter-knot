/** 站内通知：点赞 / 评论 / @提及 / 关注 写入与读取（基于 Netlify Blobs）
 *
 * 存储：
 * - 每条通知存 `notifications/<recipientId>/<id>.json`
 * - 列表用 listKeys("notifications/<recipientId>/") 扫描（当前规模足够）
 * - 免打扰设置存 `notifications/<recipientId>/_settings.json`
 */

import { getJson, setJson, listKeys } from "./storage";
import { getUser } from "./feed";
import { DEFAULT_AVATAR, type Doc } from "./serialize";

export type NotificationType = "like" | "comment" | "mention" | "follow";

export interface AppNotification {
  id: string;
  type: NotificationType;
  actor: {
    documentId: string;
    name: string;
    username: string;
    avatar: string;
  };
  target?: {
    postId?: string;
    postTitle?: string;
    commentId?: string;
    snippet?: string;
  };
  createdAt: string;
  read: boolean;
}

/** 通知免打扰设置 */
export interface NotificationSettings {
  /** 全局免打扰：开启后不接收任何通知 */
  muted: boolean;
  /** 按类型免打扰 */
  mutedTypes: Partial<Record<NotificationType, boolean>>;
}

const notifKey = (recipientId: string, id: string) => `notifications/${recipientId}/${id}.json`;

/** 读取演员用户信息，用于通知里展示头像 / 昵称 */
async function actorInfo(documentId: string): Promise<AppNotification["actor"]> {
  const u = await getUser(documentId);
  return {
    documentId,
    name: u?.name ? String(u.name) : u?.username ? String(u.username) : "用户",
    username: u?.username ? String(u.username) : "",
    avatar: u?.avatar_url ? String(u.avatar_url) : DEFAULT_AVATAR,
  };
}

/**
 * 写入一条通知。若 recipient 不存在或与 actor 相同则跳过。
 * limit：每个用户最多保留最近 N 条，超出删除最旧的。
 * anonymous：演员身份匿名（如匿名评论），通知里以「匿名用户」展示。
 * 会检查免打扰设置，如果用户对该类型通知设置了免打扰则跳过。
 */
export async function pushNotification(
  recipientId: string,
  type: NotificationType,
  actorId: string,
  target?: AppNotification["target"],
  options?: { anonymous?: boolean },
): Promise<void> {
  if (!recipientId || !actorId || recipientId === actorId) return;
  // 检查免打扰设置
  const settings = await getNotificationSettings(recipientId);
  if (settings.muted) return;
  if (settings.mutedTypes?.[type]) return;
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const actor = options?.anonymous
    ? { documentId: "", name: "匿名用户", username: "anonymous", avatar: DEFAULT_AVATAR }
    : await actorInfo(actorId);
  const notif: AppNotification = {
    id,
    type,
    actor,
    target,
    createdAt: new Date().toISOString(),
    read: false,
  };
  await setJson(notifKey(recipientId, id), notif);
  await prune(recipientId, 100);
}

/** 每个用户最多保留 MAX 条通知，超出删除最旧的（按创建时间） */
async function prune(recipientId: string, max = 100): Promise<void> {
  const keys = await listKeys(`notifications/${recipientId}/`);
  if (keys.length <= max) return;
  const docs = await Promise.all(
    keys.map(async (key) => {
      const d = await getJson<AppNotification>(key);
      return { key, createdAt: d?.createdAt || "" };
    }),
  );
  docs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const overflow = docs.slice(0, keys.length - max);
  for (const { key } of overflow) {
    try {
      const { del } = await import("./storage");
      await del(key);
    } catch {
      /* ignore */
    }
  }
}

/** 读取某用户的通知列表（最新在前） */
export async function listNotifications(recipientId: string): Promise<AppNotification[]> {
  const keys = await listKeys(`notifications/${recipientId}/`);
  const docs = await Promise.all(
    keys.map(async (key) => getJson<AppNotification>(key)),
  );
  return docs
    .filter((d): d is AppNotification => !!d)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** 把某用户的所有通知标记为已读 */
export async function markAllRead(recipientId: string): Promise<void> {
  const { del } = await import("./storage");
  const notifs = await listNotifications(recipientId);
  const unread = notifs.filter((n) => !n.read);
  for (const n of unread) {
    const key = notifKey(recipientId, n.id);
    const doc = await getJson<AppNotification>(key);
    if (doc) await setJson(key, { ...doc, read: true });
  }
  // 清理已被 prune 的孤儿 key
  const keys = await listKeys(`notifications/${recipientId}/`);
  for (const key of keys) {
    const doc = await getJson<AppNotification>(key);
    if (!doc) await del(key);
  }
}

// ── 通知免打扰设置 ──────────────────────────────────────

const settingsKey = (recipientId: string) => `notifications/${recipientId}/_settings.json`;

/** 读取用户的通知免打扰设置 */
export async function getNotificationSettings(recipientId: string): Promise<NotificationSettings> {
  const saved = await getJson<NotificationSettings>(settingsKey(recipientId));
  if (saved) return saved;
  return { muted: false, mutedTypes: {} };
}

/** 更新用户的通知免打扰设置 */
export async function updateNotificationSettings(
  recipientId: string,
  patch: Partial<NotificationSettings>,
): Promise<NotificationSettings> {
  const current = await getNotificationSettings(recipientId);
  const next: NotificationSettings = {
    muted: typeof patch.muted === "boolean" ? patch.muted : current.muted,
    mutedTypes: { ...current.mutedTypes, ...patch.mutedTypes },
  };
  await setJson(settingsKey(recipientId), next);
  return next;
}

export type { Doc };
