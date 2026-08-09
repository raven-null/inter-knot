export const MAX_IMAGE_SIZE = 30 * 1024 * 1024;

export const ALLOWED_IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "avif",
]);

export function isAllowedImage(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return ALLOWED_IMAGE_EXTENSIONS.has(ext);
}

const COMPRESS_MAX_EDGE = 2048;
const COMPRESS_QUALITY = 0.8;

/**
 * 客户端压缩图片：Netlify Functions 同步请求体上限约 6MB（二进制约 4.5MB），
 * 超限会被网关直接以 413 拒绝。上传前先把大图缩放到最长边 2048px 并转 WebP，
 * 与后端 `sharp` 的处理一致，保证上传体积远小于上限。
 *
 * - 仅对 JPEG/PNG/WebP/AVIF 且超过阈值的文件压缩；GIF 与已较小的文件原样返回。
 * - 压缩失败或压缩后反而更大时，回退为原文件。
 */
export async function compressImageFile(file: File): Promise<File> {
  const type = file.type;
  if (!type.startsWith("image/") || type === "image/gif") return file;
  if (file.size <= 4 * 1024 * 1024) return file;
  if (typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, COMPRESS_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/webp", COMPRESS_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;
    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${baseName}.webp`, { type: "image/webp" });
  } catch {
    return file;
  }
}
