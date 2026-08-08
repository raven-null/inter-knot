/** 「我的」个人设置 / 上传库 / 邮箱 / 安全等路由（基于 Netlify Blobs） */

import { getJson, setJson, del, listKeys, userKey, userEmailKey, KEYS } from "../storage";
import { requireAuth } from "../auth";
import { ok, json, badRequest, notFound, readJson, int } from "../http";
import { toUploadedFile, type Doc } from "../serialize";

async function userDoc(userId: string): Promise<Doc> {
  const u = await getJson<Doc>(userKey(userId));
  if (!u) throw { __api: true, status: 404, message: "用户不存在", code: "NOT_FOUND" } as never;
  return u;
}

export async function updateName(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const { name } = await readJson<{ name?: string }>(req);
  const clean = String(name || "").trim().slice(0, 24);
  if (!clean) return badRequest("昵称不能为空");
  const u = await userDoc(viewer.userId);
  await setJson(userKey(viewer.userId), { ...u, name: clean });
  return json({ name: clean });
}

export async function updateBio(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const { bio } = await readJson<{ bio?: string }>(req);
  const clean = String(bio || "").trim().slice(0, 300);
  const u = await userDoc(viewer.userId);
  await setJson(userKey(viewer.userId), { ...u, bio: clean });
  return json({ bio: clean });
}

export async function updateVisibility(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const { profileHidden } = await readJson<{ profileHidden?: boolean }>(req);
  const u = await userDoc(viewer.userId);
  await setJson(userKey(viewer.userId), { ...u, profile_hidden: profileHidden === true });
  return json({ profileHidden: profileHidden === true });
}

export async function security(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const u = await userDoc(viewer.userId);
  return json({
    email: u.email ? String(u.email) : "",
    provider: u.email ? "local" : "mihoyo",
    hasBoundEmail: Boolean(u.email),
    hasPassword: Boolean(u.password_hash),
  });
}

export async function sendBindEmailCode(req: Request): Promise<Response> {
  const { email } = await readJson<{ email?: string }>(req);
  const e = String(email || "").trim().toLowerCase();
  if (!e) return badRequest("请输入邮箱");
  return json({ email: e, sent: true, expiresIn: 600, cooldown: 0 });
}

export async function bindEmail(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const { email } = await readJson<{ email?: string }>(req);
  const e = String(email || "").trim().toLowerCase();
  if (!e) return badRequest("请输入邮箱");
  const u = await userDoc(viewer.userId);
  await setJson(userKey(viewer.userId), { ...u, email: e });
  await setJson(userEmailKey(e), { document_id: viewer.userId });
  return json({ email: e, provider: "local", hasBoundEmail: true, hasPassword: true });
}

export async function uploads(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const u = new URL(req.url);
  const page = Math.max(1, int(u.searchParams.get("page"), 1));
  const pageSize = Math.min(60, Math.max(1, int(u.searchParams.get("pageSize"), 24)));
  const keys = (await listKeys("uploads/")).filter((k) => !k.includes("/by-document/"));
  const mine: Doc[] = [];
  for (const key of keys) {
    const d = await getJson<Doc>(key);
    if (d && String(d.owner_id) === viewer.userId) mine.push(d);
  }
  mine.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  const total = mine.length;
  const offset = (page - 1) * pageSize;
  const slice = mine.slice(offset, offset + pageSize);
  return json({
    data: slice.map((d) => toUploadedFile(d)),
    meta: { pagination: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) } },
  });
}

export async function deleteUpload(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const documentId = decodeURIComponent(req.url.split("?")[0]!.split("/").filter(Boolean).pop() || "");
  const keys = (await listKeys("uploads/")).filter((k) => !k.includes("/by-document/"));
  for (const key of keys) {
    const d = await getJson<Doc>(key);
    if (d && String(d.document_id) === documentId && String(d.owner_id) === viewer.userId) {
      await del(key);
      await del(`uploads/by-document/${documentId}.json`);
      try {
        const { getStore } = await import("@netlify/blobs");
        const store = getStore("uploads");
        const blobKey = String(d.url).split("/").pop();
        if (blobKey) await store.delete(blobKey);
      } catch {
        // 忽略清理失败
      }
      return ok({ deleted: true, inUse: false });
    }
  }
  return ok({ deleted: false, inUse: false });
}

// ── 名片 / 背景（自定义背景图管理） ──────────────
type BgIndex = {
  items: Array<{ documentId: string; url: string; name: string; createdAt: string }>;
  equippedDocumentId: string | null;
};

async function readBgIndex(userId: string): Promise<BgIndex> {
  const idx = await getJson<Partial<BgIndex>>(KEYS.customBackgrounds(userId));
  return {
    items: Array.isArray(idx?.items) ? idx.items : [],
    equippedDocumentId: idx?.equippedDocumentId ?? null,
  };
}

async function writeBgIndex(userId: string, idx: BgIndex): Promise<void> {
  await setJson(KEYS.customBackgrounds(userId), idx);
}

/**
 * 用强一致性索引 `uploads/by-document/{id}.json` 直接定位上传记录，
 * 避免 listKeys（最终一致）刚上传后查不到导致 400「文件不存在」。
 * 仅返回属于当前用户的记录。
 */
const UPLOAD_BY_DOC = (id: string) => `uploads/by-document/${id}.json`;

async function findOwnedUpload(
  viewer: { userId: string },
  documentId: string,
): Promise<{ url: string; width?: number; height?: number } | null> {
  const meta = await getJson<{ url?: string; owner_id?: string; width?: number; height?: number }>(UPLOAD_BY_DOC(documentId));
  if (!meta?.url) return null;
  if (String(meta.owner_id) !== viewer.userId) return null;
  return { url: String(meta.url), width: meta.width, height: meta.height };
}

export async function businessCards(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const idx = await readBgIndex(viewer.userId);
  const items = idx.items.map((it) => ({
    documentId: it.documentId,
    name: it.name || "自定义背景",
    type: "character",
    image: it.url,
    createdAt: it.createdAt,
  }));
  const equipped = items.find((it) => it.documentId === idx.equippedDocumentId) ?? null;
  return json({ data: items, equippedCardDocumentId: idx.equippedDocumentId, equippedCard: equipped });
}

export async function equipBusinessCard(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const { documentId } = await readJson<{ documentId?: string | null }>(req);
  const idx = await readBgIndex(viewer.userId);
  if (documentId) {
    const found = idx.items.some((it) => it.documentId === documentId);
    if (!found) return badRequest("背景不存在");
    idx.equippedDocumentId = documentId;
  } else {
    idx.equippedDocumentId = null;
  }
  await writeBgIndex(viewer.userId, idx);
  return json({ success: true, equippedCardDocumentId: idx.equippedDocumentId });
}

/** 上传自定义背景图（body: { fileId }，fileId 来自 uploads 记录） */
export async function uploadCustomCard(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const { fileId } = await readJson<{ fileId?: string | number }>(req);
  if (!fileId) return badRequest("缺少文件");
  const documentId = String(fileId);
  const upload = await findOwnedUpload(viewer, documentId);
  if (!upload) return badRequest("文件不存在");

  const idx = await readBgIndex(viewer.userId);
  const newItem = {
    documentId,
    url: upload.url,
    name: "自定义背景",
    createdAt: new Date().toISOString(),
  };
  idx.items = [newItem, ...idx.items.filter((it) => it.documentId !== documentId)];
  idx.equippedDocumentId = documentId;
  await writeBgIndex(viewer.userId, idx);
  return json({
    data: {
      documentId,
      name: "自定义背景",
      type: "character",
      image: upload.url,
      createdAt: newItem.createdAt,
    },
    equippedCardDocumentId: documentId,
  });
}

/** 删除自定义背景图（DELETE /api/me/business-cards/:documentId） */
export async function deleteCustomCard(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const documentId = decodeURIComponent(req.url.split("?")[0]!.split("/").filter(Boolean).pop() || "");
  if (!documentId) return badRequest("缺少参数");
  const idx = await readBgIndex(viewer.userId);
  const nextItems = idx.items.filter((it) => it.documentId !== documentId);
  if (nextItems.length === idx.items.length) return notFound("背景不存在");
  idx.items = nextItems;
  if (idx.equippedDocumentId === documentId) idx.equippedDocumentId = null;
  await writeBgIndex(viewer.userId, idx);
  return ok({ deleted: true, equippedCardDocumentId: idx.equippedDocumentId });
}

export async function avatars(): Promise<Response> {
  return json({ data: [], equippedAvatarDocumentId: null });
}

export async function equipAvatar(): Promise<Response> {
  return json({ success: true });
}

export async function uploadCustomAvatar(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const { fileId } = await readJson<{ fileId?: string | number }>(req);
  if (!fileId) return badRequest("缺少文件");
  const documentId = String(fileId);
  const upload = await findOwnedUpload(viewer, documentId);
  if (!upload) return badRequest("文件不存在");
  const u = await userDoc(viewer.userId);
  await setJson(userKey(viewer.userId), { ...u, avatar_url: upload.url });
  return json({ avatar: { url: upload.url } });
}

// ── 精选帖子（个人主页展示定制） ─────────────
const PINNED_MAX = 6;

/** 列出该用户已发布、且当前登录者可见的帖子作为候选 */
async function pinnedCandidates(
  userId: string,
  viewerId: string | null,
): Promise<Array<{ documentId: string; title: string; cover: unknown; updatedAt: string }>> {
  const { getFeed } = await import("../feed");
  const feed = await getFeed();
  let mine = feed.filter((p) => String(p.author_document_id) === userId);
  if (viewerId) {
    const blocked = new Set((await listKeys(`user_blocks/${viewerId}/`)).map((k) => k.split("/")[2]));
    mine = mine.filter((p) => !blocked.has(String(p.author_document_id)));
  }
  mine.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  return mine.map((p) => {
    const covers = Array.isArray(p.covers) ? (p.covers as unknown[]) : [];
    const first = (covers[0] as Record<string, unknown> | undefined) || null;
    return {
      documentId: String(p.document_id || ""),
      title: String(p.title || ""),
      cover: first?.url ? { url: String(first.url), width: first.width, height: first.height } : null,
      updatedAt: String(p.updated_at || p.created_at || ""),
    };
  });
}

export async function pinnedArticles(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const qp = new URL(req.url).searchParams;
  const limit = Math.min(100, Math.max(1, int(qp.get("limit"), 50)));
  const u = await userDoc(viewer.userId);
  const pinnedRaw = u.pinned_articles;
  const pinned = Array.isArray(pinnedRaw)
    ? (pinnedRaw as unknown[]).filter((id): id is string => typeof id === "string")
    : null;
  const candidates = await pinnedCandidates(viewer.userId, viewer.userId);
  return json({ pinned, candidates: candidates.slice(0, limit), max: PINNED_MAX });
}

export async function updatePinnedArticles(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const { pinned } = await readJson<{ pinned?: string[] | null }>(req);
  // 校验为字符串数组，且数量不超过上限
  const next: string[] | null = Array.isArray(pinned)
    ? pinned.filter((id): id is string => typeof id === "string").slice(0, PINNED_MAX)
    : null;
  const u = await userDoc(viewer.userId);
  await setJson(userKey(viewer.userId), { ...u, pinned_articles: next });
  return json({ pinned: next });
}
