/** 认证：bcrypt 密码哈希 + jose JWT 签发/校验 + 用户解析（基于 Blobs） */

import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { userKey, getJson } from "./storage";

const SECRET_TEXT = process.env.JWT_SECRET || "dev-only-change-me";
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

/** 从请求解析当前用户；未登录返回 null */
export async function resolveUser(req: Request): Promise<AuthUser | null> {
  const token = getBearerToken(req);
  if (!token) return null;
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
