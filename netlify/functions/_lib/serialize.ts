/** Blob 文档 → 前端 useApi 期望的响应结构（兼容模板数据层） */

import type { AuthUser } from "./auth";
import { getJson, userKey } from "./storage";

export const DEFAULT_AVATAR = "/images/default-avatar.webp";

export type Doc = Record<string, unknown>;

/**
 * 把帖子/评论文档里的作者展示信息用用户文档的**实时**数据覆盖：
 * - `author_level` / `author_exp`：保证任何页面显示的作者等级与用户当前等级一致
 *   （后台改级 / 经验累计后旧帖子也随之更新）。
 * - `author_name` / `author_username` / `author_avatar_url`：用户改名 / 换头像后，
 *   推荐页等旧帖卡片的作者昵称 / 头像也随之更新，无需重写整条 feed。
 *
 * 匿名帖子（is_anonymous）保持原样，避免泄露真实身份。
 */
export async function hydrateAuthorLevels(docs: Doc[]): Promise<Doc[]> {
  const ids = [...new Set(docs.map((d) => String(d.author_document_id || "")).filter(Boolean))];
  const users = await Promise.all(
    ids.map(async (id) => [id, await getJson<Doc>(userKey(id))] as const),
  );
  const map = new Map(users);
  return docs.map((d) => {
    const u = map.get(String(d.author_document_id || ""));
    if (!u || d.is_anonymous === true) return d;
    return {
      ...d,
      author_level: u.level ?? 1,
      author_exp: u.exp ?? 0,
      author_name: u.name ? String(u.name) : u.username ? String(u.username) : d.author_name,
      author_username: u.username ? String(u.username) : d.author_username,
      author_avatar_url: u.avatar_url ? String(u.avatar_url) : d.author_avatar_url,
    };
  });
}

export function toAuthor(doc: Doc | null | undefined): Doc | null {
  if (!doc) return null;
  const documentId = String(doc.document_id || "");
  const username = String(doc.username || "");
  if (!documentId && !username) return null;
  return {
    id: documentId,
    documentId,
    uid: Number(doc.uid || 0),
    username,
    login: username,
    name: doc.name ? String(doc.name) : username,
    avatar: doc.avatar_url ? String(doc.avatar_url) : DEFAULT_AVATAR,
    level: Number(doc.level || 1),
    exp: Number(doc.exp || 0),
    isAiAgent: false,
    isAdmin: doc.role === "admin",
  };
}

export interface ViewerState {
  viewer?: AuthUser | null;
  likedIds?: Set<string>;
  favoritedIds?: Set<string>;
  readIds?: Set<string>;
}

export function toPost(doc: Doc | null | undefined, state: ViewerState = {}): Doc | null {
  if (!doc) return null;
  const documentId = String(doc.document_id || "");
  if (!documentId) return null;
  const covers = (Array.isArray(doc.covers) ? (doc.covers as unknown[]) : []).map((u) => {
    if (typeof u === "string") return { url: u };
    const c = (u || {}) as Doc;
    return {
      documentId: c.document_id ? String(c.document_id) : c.documentId ? String(c.documentId) : undefined,
      url: String(c.url || ""),
      width: c.width != null ? Number(c.width) : undefined,
      height: c.height != null ? Number(c.height) : undefined,
    };
  });
  const viewerId = state.viewer?.userId;
  const isOwner = viewerId != null && doc.author_document_id != null && String(viewerId) === String(doc.author_document_id);

  return {
    id: documentId,
    documentId,
    title: String(doc.title || "无标题"),
    body: doc.body ? String(doc.body) : "",
    text: doc.text ? String(doc.text) : "",
    rawBodyText: doc.text ? String(doc.text) : "",
    externalVideos: Array.isArray(doc.external_videos) ? doc.external_videos : [],
    covers,
    cover: covers[0]?.url || "",
    coverWidth: doc.cover_width != null ? Number(doc.cover_width) : undefined,
    coverHeight: doc.cover_height != null ? Number(doc.cover_height) : undefined,
    views: Number(doc.views || 0),
    likesCount: Number(doc.likes_count || 0),
    commentsCount: Number(doc.comments_count || 0),
    favoritesCount: Number(doc.favorites_count || 0),
    dennyCount: 0,
    hasGivenDenny: false,
    isRead: state.readIds ? state.readIds.has(documentId) : false,
    liked: state.likedIds ? state.likedIds.has(documentId) : false,
    favorited: state.favoritedIds ? state.favoritedIds.has(documentId) : false,
    isAnonymous: doc.is_anonymous === true,
    isHidden: doc.is_hidden === true,
    isOwner,
    category:
      doc.category_slug && doc.category_name
        ? { name: String(doc.category_name), slug: String(doc.category_slug) }
        : null,
    createdAt: String(doc.created_at || ""),
    updatedAt: String(doc.updated_at || ""),
    editedAt: undefined,
    author:
      toAuthor({
        document_id: doc.author_document_id,
        username: doc.author_username,
        name: doc.author_name,
        avatar_url: doc.author_avatar_url,
        level: doc.author_level,
        exp: doc.author_exp,
      }) || { name: "已注销", username: "unknown", avatar: DEFAULT_AVATAR, level: 1, exp: 0 },
  };
}

export function toComment(doc: Doc | null | undefined, likedIds?: Set<string>): Doc | null {
  if (!doc) return null;
  const documentId = String(doc.document_id || "");
  if (!documentId) return null;
  const images = Array.isArray(doc.images)
    ? (doc.images as unknown[]).map((u) => (typeof u === "string" ? u : String((u as Doc)?.url || ""))).filter(Boolean)
    : [];
  return {
    id: documentId,
    documentId,
    content: String(doc.content || ""),
    images: images.map((url) => ({ url })),
    liked: likedIds ? likedIds.has(documentId) : false,
    likesCount: Number(doc.likes_count || 0),
    createdAt: String(doc.created_at || ""),
    isPinned: doc.is_pinned === true,
    pinnedAt: undefined,
    floor: doc.floor != null ? Number(doc.floor) : undefined,
    author:
      toAuthor({
        document_id: doc.author_document_id,
        username: doc.author_username,
        name: doc.author_name,
        avatar_url: doc.author_avatar_url,
        level: doc.author_level,
        exp: doc.author_exp,
      }) || { name: "已注销", username: "unknown", avatar: DEFAULT_AVATAR, level: 1, exp: 0 },
  };
}

export function toCategory(doc: Doc): Doc {
  return {
    documentId: String(doc.document_id || ""),
    name: String(doc.name || ""),
    slug: String(doc.slug || ""),
    order: doc.sort_order != null ? Number(doc.sort_order) : undefined,
    adminOnly: doc.is_admin_only === true,
    description: String(doc.description || ""),
    icon: String(doc.icon || ""),
    isHidden: doc.is_hidden === true,
    sortOrder: doc.sort_order != null ? Number(doc.sort_order) : undefined,
    createdAt: String(doc.created_at || ""),
  };
}

export function toDraft(doc: Doc): Doc {
  const covers = (Array.isArray(doc.covers) ? (doc.covers as unknown[]) : []).map((u) => {
    if (typeof u === "string") return { url: u };
    const c = (u || {}) as Doc;
    return {
      documentId: c.document_id ? String(c.document_id) : c.documentId ? String(c.documentId) : undefined,
      url: String(c.url || ""),
      width: c.width != null ? Number(c.width) : undefined,
      height: c.height != null ? Number(c.height) : undefined,
    };
  });
  return {
    documentId: String(doc.document_id || ""),
    id: String(doc.document_id || ""),
    title: String(doc.title || ""),
    text: String(doc.text || ""),
    editorState: Array.isArray(doc.editor_state) ? doc.editor_state : undefined,
    externalVideos: Array.isArray(doc.external_videos) ? doc.external_videos : [],
    cover: covers,
    hasPublishedVersion: doc.status !== "draft",
    category:
      doc.category_slug && doc.category_name ? { name: String(doc.category_name), slug: String(doc.category_slug) } : null,
    createdAt: String(doc.created_at || ""),
    updatedAt: String(doc.updated_at || ""),
  };
}

export function toUploadedFile(doc: Doc): Doc {
  const documentId = String(doc.document_id || "");
  return {
    id: documentId,
    documentId,
    name: doc.name ? String(doc.name) : undefined,
    url: String(doc.url || ""),
    mime: doc.mime ? String(doc.mime) : "image/webp",
    size: doc.size != null ? Number(doc.size) : undefined,
    width: doc.width != null ? Number(doc.width) : undefined,
    height: doc.height != null ? Number(doc.height) : undefined,
    createdAt: String(doc.created_at || ""),
  };
}
