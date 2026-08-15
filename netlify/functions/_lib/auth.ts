/** 认证：bcrypt 密码哈希 + jose JWT 签发/校验 + 用户解析（基于 Blobs） */

import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { userKey, getJson } from "./storage";

/**
 * JWT 签名密钥。
 * - 生产环境必须在 Netlify 环境变量配置 JWT_SECRET（scope 含 Functions）；
 * - 缺失时回退到开发密钥并打印醒目告警——开发密钥可被用于伪造任意用户
 *   （含管理员）token，绝不能在生产使用。
 */
const SECRET_TEXT = process.env.JWT_SECRET || "dev-only-change-me";
if (SECRET_TEXT === "dev-only-change-me" && process.env.NODE_ENV === "production") {
  console.error(
    "[auth] 严重安全警告：生产环境未配置 JWT_SECRET，正在使用开发密钥！" +
      "任何知道默认密钥的人都可以伪造管理员 token。请在 Netlify 环境变量中配置 JWT_SECRET。",
  );
}
const SECRET = new TextEncoder().encode(SECRET_TEXT);

export interface AuthUser {
  /** 用户 documentId（对外身份标识） */
  userId: string;
  documentId: string;
  username: string;
  role: string;
  isAdmin: boolean;
}

const TOKEN_TTL = "7d";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}

export async function signToken(user: {
  documentId: string;
  username: string;
  role: string;
}): Promise<string> {
  return new SignJWT({
    role: user.role,
    username: user.username,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.documentId)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<{ documentId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    if (!sub) return null;
    return { documentId: sub };
  } catch {
    return null;
  }
}

/** 从请求头解析 Bearer token（兼容 localStorage + Authorization 方案） */
export function getBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  return match ? match[1] : null;
}

/**
 * 请求级用户缓存：同一 token 在短窗口内（如 Fairy Agent 一轮对话中多个
 * 合成请求）避免重复读用户文档。封禁/降权最长延迟 5s 生效，可接受。
 */
const USER_CACHE_TTL_MS = 5_000;
const userCache = new Map<string, { expiresAt: number; user: AuthUser | null }>();

function cachedResolve(token: string, fn: () => Promise<AuthUser | null>): Promise<AuthUser | null> {
  const hit = userCache.get(token);
  if (hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.user);
  return fn().then((user) => {
    // 只缓存已登录用户（未登录无 token 语义，缓存 null 无意义）
    if (user) userCache.set(token, { expiresAt: Date.now() + USER_CACHE_TTL_MS, user });
    // 控制缓存大小：超过 500 条时清理过期项
    if (userCache.size > 500) {
      const now = Date.now();
      for (const [k, v] of userCache) {
        if (v.expiresAt <= now) userCache.delete(k);
      }
    }
    return user;
  });
}

/** 从请求解析当前用户；未登录返回 null */
export async function resolveUser(req: Request): Promise<AuthUser | null> {
  const token = getBearerToken(req);
  if (!token) return null;
  return cachedResolve(token, async () => {
    const payload = await verifyToken(token);
    if (!payload) return null;
    const user = await getJson<Record<string, unknown>>(userKey(payload.documentId));
    if (!user || user.status !== "active") return null;
    const role = String(user.role || "user");
    return {
      userId: payload.documentId,
      documentId: payload.documentId,
      username: String(user.username || ""),
      role,
      isAdmin: role === "admin",
    };
  });
}

export async function requireAuth(req: Request): Promise<AuthUser> {
  const user = await resolveUser(req);
  if (!user) throw { __api: true, status: 401, message: "未登录或登录已过期", code: "UNAUTHORIZED" } as never;
  return user;
}

export async function requireAdmin(req: Request): Promise<AuthUser> {
  const user = await resolveUser(req);
  if (!user) throw { __api: true, status: 401, message: "未登录或登录已过期", code: "UNAUTHORIZED" } as never;
  if (user.role !== "admin") throw { __api: true, status: 403, message: "需要管理员权限", code: "FORBIDDEN" } as never;
  return user;
}

export function isApiThrow(err: unknown): err is { __api: true; status: number; message: string; code?: string } {
  return !!err && typeof err === "object" && (err as { __api?: boolean }).__api === true;
}
