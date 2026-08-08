/**
 * 后台管理 API（/api/admin/*）
 */

interface AdminUser {
  documentId: string;
  username: string;
  name: string;
  email: string;
  avatar: string;
  level: number;
  exp: number;
  role: string;
  status: string;
  createdAt: string;
}

interface AdminPost {
  documentId: string;
  title: string;
  status: string;
  isPinned: boolean;
  isHidden: boolean;
  views: number;
  likesCount: number;
  commentsCount: number;
  createdAt: string;
  author?: { documentId?: string; name?: string; avatar?: string } | null;
  category?: { name?: string; slug?: string } | null;
  cover?: string;
}

interface AdminComment {
  documentId: string;
  content: string;
  likesCount: number;
  createdAt: string;
  author?: { name?: string; avatar?: string } | null;
}

interface Paginated<T> {
  data: T[];
  meta?: { pagination?: { page: number; pageSize: number; total: number; pageCount: number } };
}

export function useAdminApi() {
  const { $api } = useNuxtApp();

  const stats = async () => {
    const res = await $api<Record<string, unknown>>("/api/admin/stats");
    return res || {};
  };

  const users = async (page = 1, pageSize = 20, q = "") => {
    return $api<Paginated<AdminUser>>("/api/admin/users", {
      query: { page: String(page), pageSize: String(pageSize), q },
    });
  };

  const updateUser = async (documentId: string, patch: { role?: string; status?: string }) => {
    return $api(`/api/admin/users/${documentId}`, { method: "PATCH", body: patch });
  };

  const posts = async (page = 1, pageSize = 20, q = "", status = "") => {
    return $api<Paginated<AdminPost>>("/api/admin/posts", {
      query: { page: String(page), pageSize: String(pageSize), q, status },
    });
  };

  const updatePost = async (documentId: string, patch: { status?: string; isPinned?: boolean; isHidden?: boolean }) => {
    return $api(`/api/admin/posts/${documentId}`, { method: "PATCH", body: patch });
  };

  /** 彻底删除（草稿删档；已发布标记删除并从信息流移除） */
  const deleteArticle = async (documentId: string) => {
    return $api(`/api/articles/${documentId}`, { method: "DELETE" });
  };

  const comments = async (page = 1, pageSize = 20, q = "") => {
    return $api<Paginated<AdminComment>>("/api/admin/comments", {
      query: { page: String(page), pageSize: String(pageSize), q },
    });
  };

  const deleteComment = async (documentId: string) => {
    return $api(`/api/admin/comments/${documentId}`, { method: "DELETE" });
  };

  const categories = async () => {
    const res = await $api<{ data: AdminCategory[] }>("/api/admin/categories");
    return res?.data || [];
  };

  const createCategory = async (payload: { name: string; slug: string; description?: string; sortOrder?: number }) => {
    return $api("/api/admin/categories", { method: "POST", body: payload });
  };

  const updateCategory = async (documentId: string, payload: Record<string, unknown>) => {
    return $api(`/api/admin/categories/${documentId}`, { method: "PUT", body: payload });
  };

  const deleteCategory = async (documentId: string) => {
    return $api(`/api/admin/categories/${documentId}`, { method: "DELETE" });
  };

  const settings = async () => {
    const res = await $api<AdminSettings>("/api/admin/settings");
    return res || { siteName: "绳网", announcement: "", allowRegister: true, needAudit: false };
  };

  const updateSettings = async (payload: Partial<AdminSettings>) => {
    return $api("/api/admin/settings", { method: "PUT", body: payload });
  };

  /** 表情包：列表（manifest 同构） */
  const emotes = async () => {
    const res = await $api<EmoteManifest>("/api/admin/emotes");
    return res || { groups: [], emotes: [] };
  };

  const createEmote = async (payload: { code: string; name: string; group?: string; dataUrl: string }) => {
    return $api("/api/admin/emotes", { method: "POST", body: payload });
  };

  const deleteEmote = async (code: string) => {
    return $api(`/api/admin/emotes/${code}`, { method: "DELETE" });
  };

  const addEmoteGroup = async (name: string, order?: number) => {
    return $api("/api/admin/emotes/groups", { method: "POST", body: { name, order } });
  };

  const deleteEmoteGroup = async (name: string) => {
    return $api(`/api/admin/emotes/groups/${encodeURIComponent(name)}`, { method: "DELETE" });
  };

  interface AdminReport {
    documentId: string;
    targetType: string;
    targetId: string;
    reason: string;
    detail?: string;
    status: string;
    createdAt: string;
    reporter?: { documentId: string; name: string } | null;
    target?: Record<string, unknown> | null;
  }

  const reports = async (page = 1, pageSize = 20, status = "") => {
    return $api<Paginated<AdminReport>>("/api/admin/reports", {
      query: { page: String(page), pageSize: String(pageSize), status },
    });
  };

  const processReport = async (documentId: string, action: "delete" | "dismiss") => {
    return $api(`/api/admin/reports/${documentId}`, { method: "POST", body: { action } });
  };

  return {
    stats,
    users,
    updateUser,
    posts,
    updatePost,
    deleteArticle,
    comments,
    deleteComment,
    categories,
    createCategory,
    updateCategory,
    deleteCategory,
    settings,
    updateSettings,
    emotes,
    createEmote,
    deleteEmote,
    addEmoteGroup,
    deleteEmoteGroup,
    reports,
    processReport,
  };
}

export interface AdminCategory {
  documentId: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  sortOrder: number;
  isHidden: boolean;
  isAdminOnly: boolean;
  createdAt: string;
}

export interface AdminSettings {
  siteName: string;
  announcement: string;
  allowRegister: boolean;
  needAudit: boolean;
  showSearch?: boolean;
  showPresence?: boolean;
  showKnock?: boolean;
  showCreate?: boolean;
  showAdmin?: boolean;
}

export interface EmoteManifest {
  groups: Array<{ name: string; order: number; iconUrl: string | null }>;
  emotes: Array<{
    id: string;
    code: string;
    name: string;
    group: string;
    url: string;
    width: number | null;
    height: number | null;
  }>;
}
