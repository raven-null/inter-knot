/** 数据库行 → 前端 useApi 期望的响应结构（兼容模板数据层） */

import type { AuthUser } from "./auth";

export const DEFAULT_AVATAR = "/images/default-avatar.webp";

interface UserRow {
  id: number | string;
  document_id: string;
  username: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  level: number | string;
  exp: number | string;
  role: string;
  status: string;
}

export function toAuthor(row: UserRow | null | undefined): Record<string, unknown> | null {
  if (!row) return null;
  return {
    id: Number(row.id),
    documentId: row.document_id,
    username: row.username,
    login: row.username,
    name: row.name || row.username,
    email: row.email,
    avatar: row.avatar_url || DEFAULT_AVATAR,
    level: Number(row.level),
    exp: Number(row.exp),
    isAiAgent: false,
    isAdmin: row.role === "admin",
  };
}

export interface PostRow {
  id: number | string;
  document_id: string;
  category_id: number | string | null;
  category_name: string | null;
  category_slug: string | null;
  author_id: number | string | null;
  title: string;
  text: string;
  body: string;
  covers: string[] | null;
  cover_width: number | string | null;
  cover_height: number | string | null;
  external_videos: unknown;
  status: string;
  is_pinned: boolean;
  is_anonymous: boolean;
  is_hidden: boolean;
  views: number | string;
  likes_count: number | string;
  comments_count: number | string;
  favorites_count: number | string;
  created_at: Date | string;
  updated_at: Date | string;
  published_at: Date | string | null;
  author_document_id?: string | null;
  author_username?: string | null;
  author_name?: string | null;
  author_avatar_url?: string | null;
  author_level?: number | string | null;
  author_exp?: number | string | null;
}

export interface ViewerState {
  viewer?: AuthUser | null;
  likedIds?: Set<string>;
  favoritedIds?: Set<string>;
  readIds?: Set<string>;
}

export function toPost(row: PostRow | null | undefined, state: ViewerState = {}): Record<string, unknown> | null {
  if (!row) return null;
  const id = row.document_id;
  const covers = Array.isArray(row.covers)
    ? row.covers.filter((u): u is string => typeof u === "string" && u.length > 0)
    : [];
  const viewerId = state.viewer?.userId;
  const isOwner = viewerId != null && row.author_id != null && Number(viewerId) === Number(row.author_id);

  const authorRow: UserRow | null = row.author_document_id
    ? {
        id: row.author_id!,
        document_id: row.author_document_id,
        username: row.author_username!,
        name: row.author_name,
        email: null,
        avatar_url: row.author_avatar_url,
        level: row.author_level ?? 1,
        exp: row.author_exp ?? 0,
        role: "user",
        status: "active",
      }
    : null;

  return {
    id,
    documentId: id,
    title: row.title,
    body: row.body || "",
    text: row.text || "",
    rawBodyText: row.text || "",
    externalVideos: row.external_videos || [],
    covers: covers.map((url) => ({ url })),
    cover: covers[0] || "",
    coverWidth: row.cover_width != null ? Number(row.cover_width) : undefined,
    coverHeight: row.cover_height != null ? Number(row.cover_height) : undefined,
    views: Number(row.views || 0),
    likesCount: Number(row.likes_count || 0),
    commentsCount: Number(row.comments_count || 0),
    favoritesCount: Number(row.favorites_count || 0),
    dennyCount: 0,
    hasGivenDenny: false,
    isRead: state.readIds ? state.readIds.has(id) : false,
    liked: state.likedIds ? state.likedIds.has(id) : false,
    favorited: state.favoritedIds ? state.favoritedIds.has(id) : false,
    isAnonymous: !!row.is_anonymous,
    isHidden: !!row.is_hidden,
    isOwner,
    category:
      row.category_slug && row.category_name
        ? { name: row.category_name, slug: row.category_slug }
        : null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    editedAt: undefined,
    author: toAuthor(authorRow) || { name: "已注销", username: "unknown", avatar: DEFAULT_AVATAR, level: 1, exp: 0 },
  };
}

export interface CommentRow {
  id: number | string;
  document_id: string;
  post_id: number | string | null;
  author_id: number | string | null;
  parent_id: number | string | null;
  content: string;
  images: string[] | null;
  is_pinned: boolean;
  likes_count: number | string;
  floor: number | string | null;
  created_at: Date | string;
  author_document_id?: string | null;
  author_username?: string | null;
  author_name?: string | null;
  author_avatar_url?: string | null;
  author_level?: number | string | null;
}

export function toComment(row: CommentRow | null | undefined, likedIds?: Set<string>): Record<string, unknown> | null {
  if (!row) return null;
  const authorRow: UserRow | null = row.author_document_id
    ? {
        id: row.author_id!,
        document_id: row.author_document_id,
        username: row.author_username!,
        name: row.author_name,
        email: null,
        avatar_url: row.author_avatar_url,
        level: row.author_level ?? 1,
        exp: 0,
        role: "user",
        status: "active",
      }
    : null;
  return {
    id: row.document_id,
    documentId: row.document_id,
    content: row.content,
    images: Array.isArray(row.images) ? row.images.filter(Boolean).map((url) => ({ url })) : [],
    liked: likedIds ? likedIds.has(row.document_id) : false,
    likesCount: Number(row.likes_count || 0),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    isPinned: !!row.is_pinned,
    pinnedAt: undefined,
    floor: row.floor != null ? Number(row.floor) : undefined,
    author: toAuthor(authorRow) || { name: "已注销", username: "unknown", avatar: DEFAULT_AVATAR, level: 1, exp: 0 },
  };
}

export function toCategory(row: {
  document_id: string;
  name: string;
  slug: string;
  sort_order?: number | string;
  is_admin_only?: boolean;
}): Record<string, unknown> {
  return {
    documentId: row.document_id,
    name: row.name,
    slug: row.slug,
    order: row.sort_order != null ? Number(row.sort_order) : undefined,
    adminOnly: !!row.is_admin_only,
  };
}

export function toDraft(row: {
  document_id: string;
  title: string;
  text: string;
  external_videos?: unknown;
  covers?: string[] | null;
  editor_state?: unknown;
  category_name?: string | null;
  category_slug?: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}): Record<string, unknown> {
  const covers = Array.isArray(row.covers) ? row.covers.filter(Boolean).map((url) => ({ url })) : [];
  return {
    documentId: row.document_id,
    id: row.document_id,
    title: row.title,
    text: row.text,
    editorState: row.editor_state ?? undefined,
    externalVideos: row.external_videos ?? [],
    cover: covers,
    hasPublishedVersion: false,
    category:
      row.category_slug && row.category_name ? { name: row.category_name, slug: row.category_slug } : null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

export function toUploadedFile(row: {
  id: number | string;
  document_id: string;
  object_key?: string;
  name?: string | null;
  mime?: string | null;
  size?: number | string | null;
  width?: number | string | null;
  height?: number | string | null;
  url: string;
  created_at: Date | string;
}): Record<string, unknown> {
  return {
    id: Number(row.id),
    documentId: row.document_id,
    name: row.name || undefined,
    url: row.url,
    mime: row.mime || "image/webp",
    size: row.size != null ? Number(row.size) : undefined,
    width: row.width != null ? Number(row.width) : undefined,
    height: row.height != null ? Number(row.height) : undefined,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}
