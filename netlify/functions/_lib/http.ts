/** 统一响应与错误处理工具（Netlify Functions v2） */

export class ApiError extends Error {
  statusCode: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(statusCode: number, message: string, code?: string, details?: Record<string, unknown>) {
    super(message);
    this.statusCode = statusCode;
    this.code = code || "ERROR";
    this.details = details;
  }
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json; charset=utf-8", ...(init.headers || {}) },
  });
}

export function ok(data: unknown, meta?: Record<string, unknown>): Response {
  const body: Record<string, unknown> = { data };
  if (meta) body.meta = meta;
  return json(body);
}

export function paginated(data: unknown[], start: number, limit: number, total: number): Response {
  return ok(data, {
    pagination: {
      start,
      limit,
      total,
      pageCount: limit > 0 ? Math.ceil(total / limit) : 0,
    },
  });
}

export function error(statusCode: number, message: string, code?: string, details?: Record<string, unknown>): Response {
  return json(
    { error: { message, code: code || "ERROR", details } },
    { status: statusCode },
  );
}

export function badRequest(message: string, code?: string): Response {
  return error(400, message, code || "BAD_REQUEST");
}

export function unauthorized(message = "未登录或登录已过期"): Response {
  return error(401, message, "UNAUTHORIZED");
}

export function forbidden(message: string, code = "FORBIDDEN"): Response {
  return error(403, message, code);
}

export function notFound(message = "资源不存在"): Response {
  return error(404, message, "NOT_FOUND");
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    const body = await req.json();
    return (body ?? {}) as T;
  } catch {
    return {} as T;
  }
}

export function queryParams(req: Request): URLSearchParams {
  return new URL(req.url).searchParams;
}

export function param(req: Request): string {
  return req.url.split("?")[0]!.split("/").pop() || "";
}

export function bool(input: unknown): boolean {
  return input === true || input === "true" || input === "1";
}

export function int(input: unknown, fallback = 0): number {
  const n = Number(input);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}
