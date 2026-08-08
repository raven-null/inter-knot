/**
 * 表情包路由：公开 manifest + 后台增删 / 分组管理。
 *
 * 存储：
 * - manifest 文档（data store `emotes.json`）：`{ groups, emotes }`
 * - 表情图片字节（uploads store `emotes/<id>.webp`），经 `/api/uploads/emotes/<id>.webp` 提供
 *
 * 前端 `useEmotes` 拉取 `GET /api/emotes/manifest`，按 code 解析渲染，
 * 评论正文以 `:ik-xxx:` shortcode 存储。新增/删除后前端在 60s 内感知（staleTime）。
 */

import { genId, getJson, setJson, KEYS } from "../storage";
import { requireAdmin } from "../auth";
import { json, badRequest, notFound, readJson } from "../http";
import sharp from "sharp";

const MAX_EDGE = 128;
const WEBP_QUALITY = 85;
const DEFAULT_GROUP = "通用";
const CODE_RE = /^ik-[a-z0-9-]{1,32}$/;

interface EmoteGroup {
  name: string;
  order: number;
  iconUrl: string | null;
}

interface EmoteItem {
  id: string;
  code: string;
  name: string;
  group: string;
  url: string;
  width: number | null;
  height: number | null;
}

interface EmoteManifest {
  groups: EmoteGroup[];
  emotes: EmoteItem[];
}

async function uploadsStore() {
  const { getStore } = await import("@netlify/blobs");
  return getStore("uploads");
}

async function readManifest(): Promise<EmoteManifest> {
  const doc = (await getJson<EmoteManifest>(KEYS.emotes)) || null;
  if (doc && Array.isArray(doc.emotes) && Array.isArray(doc.groups)) return doc;
  return { groups: [{ name: DEFAULT_GROUP, order: 1, iconUrl: null }], emotes: [] };
}

async function saveManifest(doc: EmoteManifest): Promise<void> {
  await setJson(KEYS.emotes, doc);
}

/** 公开 manifest：GET /api/emotes/manifest */
export async function manifest(): Promise<Response> {
  return json(await readManifest());
}

/** 后台表情列表：GET /api/admin/emotes（与 manifest 同构，管理员直接编辑） */
export async function adminList(req: Request): Promise<Response> {
  await requireAdmin(req);
  return json(await readManifest());
}

/**
 * 新增表情：POST /api/admin/emotes
 * body: { code, name, group?, dataUrl }  —— dataUrl 为 base64 图片（可含 data:image 前缀）
 */
export async function createEmote(req: Request): Promise<Response> {
  await requireAdmin(req);
  const body = await readJson<{ code?: string; name?: string; group?: string; dataUrl?: string }>(req);
  const code = String(body.code || "").trim().toLowerCase();
  const name = String(body.name || "").trim();
  const group = String(body.group || "").trim() || DEFAULT_GROUP;
  const dataUrl = String(body.dataUrl || "");

  if (!CODE_RE.test(code)) return badRequest("表情代码需为 ik- 开头的小写字母数字，如 ik-smile");
  if (!name) return badRequest("请填写表情名称");
  if (!dataUrl) return badRequest("缺少图片");

  const doc = await readManifest();
  if (doc.emotes.some((e) => e.code === code)) return badRequest(`已存在代码「${code}」`);

  const base64 = dataUrl.includes("base64,") ? dataUrl.split("base64,")[1]! : dataUrl;
  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, "base64");
  } catch {
    return badRequest("图片数据无效");
  }
  if (!buffer.length) return badRequest("图片数据为空");

  let webp: Buffer;
  let width: number | null = null;
  let height: number | null = null;
  try {
    const image = sharp(buffer)
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY });
    webp = await image.toBuffer();
    const meta = await image.metadata();
    width = meta.width ?? null;
    height = meta.height ?? null;
  } catch {
    return badRequest("图片解析失败，请上传有效图片", "INVALID_IMAGE");
  }

  const id = genId();
  const blobKey = `emotes/${id}.webp`;
  const store = await uploadsStore();
  await store.set(blobKey, new Blob([new Uint8Array(webp)], { type: "image/webp" }), {
    metadata: { contentType: "image/webp" },
  });

  const emote: EmoteItem = {
    id,
    code,
    name,
    group,
    url: `/api/uploads/${blobKey}`,
    width,
    height,
  };

  if (!doc.groups.some((g) => g.name === group)) {
    doc.groups.push({ name: group, order: doc.groups.length + 1, iconUrl: null });
  }
  doc.emotes.push(emote);
  await saveManifest(doc);
  return json({ success: true, emote });
}

/** 删除表情：DELETE /api/admin/emotes/:code */
export async function deleteEmote(req: Request): Promise<Response> {
  await requireAdmin(req);
  const code = decodeURIComponent(req.url.split("?")[0]!.split("/").filter(Boolean).pop() || "");
  const doc = await readManifest();
  const idx = doc.emotes.findIndex((e) => e.code === code);
  if (idx === -1) return notFound("表情不存在");
  const [removed] = doc.emotes.splice(idx, 1);
  if (removed?.url) {
    try {
      const key = removed.url.split("/").pop() || "";
      const store = await uploadsStore();
      await store.delete(key);
    } catch {
      // 忽略 blob 删除失败（manifest 已移除）
    }
  }
  await saveManifest(doc);
  return json({ success: true });
}

/** 新增分组：POST /api/admin/emotes/groups { name, order? } */
export async function addGroup(req: Request): Promise<Response> {
  await requireAdmin(req);
  const body = await readJson<{ name?: string; order?: number }>(req);
  const name = String(body.name || "").trim();
  if (!name) return badRequest("请填写分组名称");
  const doc = await readManifest();
  if (doc.groups.some((g) => g.name === name)) return badRequest("分组已存在");
  doc.groups.push({ name, order: body.order != null ? Number(body.order) : doc.groups.length + 1, iconUrl: null });
  await saveManifest(doc);
  return json({ success: true });
}

/** 删除分组：DELETE /api/admin/emotes/groups/:name（该分组表情移到「通用」） */
export async function deleteGroup(req: Request): Promise<Response> {
  await requireAdmin(req);
  const name = decodeURIComponent(req.url.split("?")[0]!.split("/").filter(Boolean).pop() || "");
  const doc = await readManifest();
  const idx = doc.groups.findIndex((g) => g.name === name);
  if (idx === -1) return notFound("分组不存在");
  doc.groups.splice(idx, 1);
  let moved = false;
  for (const e of doc.emotes) {
    if (e.group === name) {
      e.group = DEFAULT_GROUP;
      moved = true;
    }
  }
  if (moved && !doc.groups.some((g) => g.name === DEFAULT_GROUP)) {
    doc.groups.push({ name: DEFAULT_GROUP, order: 1, iconUrl: null });
  }
  await saveManifest(doc);
  return json({ success: true });
}
