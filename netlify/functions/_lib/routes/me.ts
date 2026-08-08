/** 「我的」个人设置 / 上传库 / 邮箱 / 安全等路由（基于 Netlify Blobs） */

import { getJson, setJson, del, listKeys, userKey, userEmailKey } from "../storage";
import { requireAuth } from "../auth";
import { ok, json, badRequest, readJson, int } from "../http";
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

// ── 名片 / 头像（简化实现） ──────────────────────────
export async function businessCards(): Promise<Response> {
  return json({ data: [], equippedCardDocumentId: null, equippedCard: null });
}

export async function equipBusinessCard(): Promise<Response> {
  return json({ success: true });
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
  const keys = (await listKeys("uploads/")).filter((k) => !k.includes("/by-document/"));
  let url = "";
  for (const key of keys) {
    const d = await getJson<Doc>(key);
    if (d && String(d.document_id) === documentId && String(d.owner_id) === viewer.userId) {
      url = String(d.url || "");
      break;
    }
  }
  if (!url) return badRequest("文件不存在");
  const u = await userDoc(viewer.userId);
  await setJson(userKey(viewer.userId), { ...u, avatar_url: url });
  return json({ avatar: { url } });
}

// ── 精选委托（简化：返回空） ─────────────────────────
export async function pinnedArticles(): Promise<Response> {
  return json({ pinned: null, candidates: [], max: 6 });
}

export async function updatePinnedArticles(req: Request): Promise<Response> {
  const { pinned } = await readJson<{ pinned?: string[] | null }>(req);
  return json({ pinned: Array.isArray(pinned) ? pinned : null });
}

// ── 每日经验（简化） ─────────────────────────────────
export async function dailyExp(): Promise<Response> {
  return json({
    todaySelfGained: 0,
    todaySelfCap: 50,
    sources: {
      checkIn: { done: false, exp: 10 },
      createArticle: { done: false, exp: 20 },
      createComment: { done: false, exp: 10 },
      likeGive: { done: false, exp: 5 },
    },
  });
}
