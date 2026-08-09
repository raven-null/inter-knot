/** 上传路由：签名 → 原图 PUT（服务端转 WebP 存 Blobs）→ 完成 */

import { genId, getJson, setJson, uploadKey } from "../storage";
import { requireAuth } from "../auth";
import { ok, json, badRequest, notFound, readJson } from "../http";
import { toUploadedFile, type Doc } from "../serialize";
import sharp from "sharp";

const MAX_ORIGINAL_SIZE = 4 * 1024 * 1024; // 4 MB（Netlify Functions 同步请求体上限约 6MB/二进制约 4.5MB）
const MAX_EDGE = 2048;
const WEBP_QUALITY = 80;
const UPLOAD_BY_DOC = (id: string) => `uploads/by-document/${id}.json`;

async function uploadsStore() {
  const { getStore } = await import("@netlify/blobs");
  return getStore("uploads");
}

export async function sign(req: Request): Promise<Response> {
  await requireAuth(req);
  const { mimeType, size, contentHash } = await readJson<{
    mimeType?: string;
    size?: number;
    contentHash?: string;
  }>(req);

  const fileSize = Number(size || 0);
  if (!Number.isFinite(fileSize) || fileSize <= 0) return badRequest("缺少文件大小");
  if (fileSize > MAX_ORIGINAL_SIZE) return badRequest("图片过大，最大 4MB", "FILE_TOO_LARGE");

  const mime = String(mimeType || "image/jpeg");
  if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(mime)) {
    return badRequest("仅支持 jpeg/png/webp 图片", "UNSUPPORTED_TYPE");
  }

  const objectKey = contentHash && /^[a-f0-9]{64}$/i.test(contentHash) ? contentHash.toLowerCase() : genId();

  // 内容级去重：命中已有文件直接复用
  const existing = await getJson<Doc>(uploadKey(objectKey));
  if (existing) {
    return ok({
      uploadUrl: "",
      uploadToken: objectKey,
      method: "PUT",
      objectKey,
      publicUrl: `/api/uploads/${objectKey}.webp`,
      headers: {},
      expiresAt: "",
      existing: toUploadedFile(existing),
    });
  }

  // 客户端随后用 signed.headers 直接 PUT 原始文件到 /api/direct-upload/raw/:key，
  // 该路由需要鉴权，因此把请求头中的 Authorization 原样回传。
  const authHeader = req.headers.get("authorization");
  const headers = authHeader ? { Authorization: authHeader } : {};

  return ok({
    uploadUrl: `/api/direct-upload/raw/${objectKey}`,
    uploadToken: objectKey,
    method: "PUT",
    objectKey,
    publicUrl: `/api/uploads/${objectKey}.webp`,
    headers,
    expiresAt: "",
    existing: undefined,
  });
}

/** PUT /api/direct-upload/raw/:key —— 接收原始文件，服务端转 WebP 存 Blobs */
export async function rawUpload(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const key = decodeURIComponent(req.url.split("/").filter(Boolean).pop() || "");
  if (!key) return badRequest("缺少对象键");

  const arrayBuffer = await req.arrayBuffer();
  if (!arrayBuffer || arrayBuffer.byteLength === 0) return badRequest("空文件");
  if (arrayBuffer.byteLength > MAX_ORIGINAL_SIZE) return badRequest("图片过大", "FILE_TOO_LARGE");

  let webp: Buffer;
  let width: number | undefined;
  let height: number | undefined;
  try {
    const image = sharp(Buffer.from(arrayBuffer))
      .rotate() // 按 EXIF 方向矫正
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY });
    webp = await image.toBuffer();
    const meta = await image.metadata();
    width = meta.width;
    height = meta.height;
  } catch {
    return badRequest("图片解析失败", "INVALID_IMAGE");
  }

  const blobKey = `${key}.webp`;
  const store = await uploadsStore();
  await store.set(blobKey, new Blob([new Uint8Array(webp)], { type: "image/webp" }), {
    metadata: { contentType: "image/webp" },
  });

  // 记录到 data store（keyed by objectKey = contentHash 便于去重）
  const documentId = genId();
  const now = new Date().toISOString();
  const doc: Doc = {
    id: documentId,
    document_id: documentId,
    owner_id: viewer.userId,
    object_key: key,
    name: "image.webp",
    mime: "image/webp",
    size: webp.byteLength,
    width: width ?? null,
    height: height ?? null,
    url: `/api/uploads/${blobKey}`,
    created_at: now,
  };
  await setJson(uploadKey(key), doc);
  await setJson(UPLOAD_BY_DOC(documentId), {
    document_id: documentId,
    owner_id: viewer.userId,
    url: doc.url,
    width,
    height,
  });
  return json({ ok: true });
}

export async function complete(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const { uploadToken, width, height } = await readJson<{ uploadToken?: string; width?: number; height?: number }>(req);
  if (!uploadToken) return badRequest("缺少 uploadToken");
  const doc = await getJson<Doc>(uploadKey(uploadToken));
  if (!doc) return notFound("上传记录不存在");
  if (String(doc.owner_id) !== viewer.userId) return notFound("上传记录不存在");
  if (width != null && height != null) {
    const updated = { ...doc, width: Number(width), height: Number(height) };
    await setJson(uploadKey(uploadToken), updated);
    await setJson(UPLOAD_BY_DOC(String(doc.document_id)), {
      document_id: doc.document_id,
      owner_id: viewer.userId,
      url: doc.url,
      width,
      height,
    });
    return ok(toUploadedFile(updated));
  }
  return ok(toUploadedFile(doc));
}

/** GET /api/uploads/:key —— 返回 Blob 图片字节 */
export async function serve(req: Request): Promise<Response> {
  const key = decodeURIComponent(req.url.split("?")[0]!.split("/").filter(Boolean).pop() || "");
  if (!key) return notFound();
  try {
    const store = await uploadsStore();
    const blob = await store.getWithMetadata(key, { type: "arrayBuffer" });
    if (!blob) return notFound("图片不存在");
    return new Response(blob.data, {
      headers: {
        "content-type": String(blob.metadata?.contentType || "image/webp"),
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return notFound("图片不存在");
  }
}
