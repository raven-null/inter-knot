/** 认证：bcrypt 密码哈希 + jose JWT 签发/校验 */

import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { unauthorized } from "./http";

const SECRET_TEXT = process.env.JWT_SECRET || "dev-only-change-me";
const SECRET = new TextEncoder().encode(SECRET_TEXT);

export interface AuthUser {
  userId: number;
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
  id: number;
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

export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    const role = String(payload.role || "user");
    if (!sub) return null;
    return {
      userId: 0, // 需要查询数据库补充
      documentId: sub,
      username: String(payload.username || ""),
      role,
      isAdmin: role === "admin",
    };
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

/** 从请求解析当前用户；未登录返回 null */
export async function resolveUser(req: Request): Promise<AuthUser | null> {
  const token = getBearerToken(req);
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  const { db } = await import("./db");
  const rows = await db().sql<{
    id: number;
    document_id: string;
    username: string;
    role: string;
    status: string;
  }>`SELECT id, document_id, username, role, status FROM users WHERE document_id = ${payload.documentId}`;
  const row = rows[0];
  if (!row || row.status !== "active") return null;
  return {
    userId: Number(row.id),
    documentId: row.document_id,
    username: row.username,
    role: row.role,
    isAdmin: row.role === "admin",
  };
}

/** 必须登录，否则 401 */
export async function requireAuth(req: Request): Promise<AuthUser> {
  const user = await resolveUser(req);
  if (!user) throw { __api: true, status: 401, message: "未登录或登录已过期", code: "UNAUTHORIZED" } as never;
  return user;
}

/** 必须管理员，否则 403 */
export async function requireAdmin(req: Request): Promise<AuthUser> {
  const user = await resolveUser(req);
  if (!user) throw { __api: true, status: 401, message: "未登录或登录已过期", code: "UNAUTHORIZED" } as never;
  if (user.role !== "admin") throw { __api: true, status: 403, message: "需要管理员权限", code: "FORBIDDEN" } as never;
  return user;
}

// 兼容 http.ts 的 ApiError 风格：上面的 throw 对象会在路由层统一转成 Response
export function isApiThrow(err: unknown): err is { __api: true; status: number; message: string; code?: string } {
  return !!err && typeof err === "object" && (err as { __api?: boolean }).__api === true;
}

export { unauthorized };
