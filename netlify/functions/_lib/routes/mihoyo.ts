/** 米游社扫码登录/绑定（对接 passport-api.mihoyo.com）
 *
 * 新版接口（ma-cn-passport，POST + 请求头参数）：
 *   1. POST /account/ma-cn-passport/web/createQRLogin  body {} → { data: { url, ticket, expire } }
 *   2. 轮询 queryQRLogin(ticket) → status（waiting/scanned/confirmed/expired/cancelled），
 *      CONFIRMED 时返回 { uid, token(stoken) }
 *   3. getCookieAccountInfoBySToken(stoken, uid) → { mid, cookie_token, account_id }
 *   4. binding/api/getUserGameRolesByCookie → 绝区零角色（zzz_cn）
 *
 * 私有请求头（x-rpc-*）通过环境变量配置，未配置时返回明确错误。
 */

import { genId, getJson, setJson, del, userKey, userUidKey } from "../storage";
import { bumpStats } from "../feed";
import { resolveUser, requireAuth, signToken } from "../auth";
import { generateUid } from "../uid";
import { json, ok, badRequest, error, readJson } from "../http";
import { toAuthor, DEFAULT_AVATAR, type Doc } from "../serialize";

const PASSPORT_BASE = "https://passport-api.mihoyo.com/account/ma-cn-passport/web";
const PASSPORT_LEGACY = "https://passport-api.mihoyo.com/account/auth/api";
const TAKUMI_BINDING = "https://api-takumi.mihoyo.com/binding/api/getUserGameRolesByCookie";

const QR_SESSION = (ticket: string) => `mihoyo/qr-sessions/${ticket}.json`;
const BINDING = (userId: string) => `mihoyo/bindings/${userId}.json`;
const BY_MIHOYO = (mid: string) => `users/by-mihoyo/${mid}.json`;

// 米游社扫码参数（默认值来自 user.mihoyo.com 抓包实测；可用环境变量覆盖）
const APP_ID = process.env.MIHOYO_APP_ID || "dw9y09jqjpxc";
const DEVICE_ID = process.env.MIHOYO_DEVICE_ID || "1760c6b8-228b-4f92-8918-eb498724d380";
const DEVICE_FP = process.env.MIHOYO_DEVICE_FP || "38d81ab24d683";
const SDK_VERSION = process.env.MIHOYO_SDK_VERSION || "2.54.0";
const CLIENT_TYPE = process.env.MIHOYO_CLIENT_TYPE || "4";
const GAME_BIZ = process.env.MIHOYO_GAME_BIZ || "plat_cn";

function configured(): boolean {
  return Boolean(APP_ID);
}

function rpcHeaders(): Record<string, string> {
  const deviceId = DEVICE_ID || crypto.randomUUID();
  return {
    "x-rpc-app_id": APP_ID,
    "x-rpc-client_type": CLIENT_TYPE,
    "x-rpc-device_id": deviceId,
    "x-rpc-device_fp": DEVICE_FP,
    "x-rpc-device_model": "Microsoft%20Edge%20151.0.0.0",
    "x-rpc-device_name": "Microsoft%20Edge",
    "x-rpc-device_os": "Windows%2010%2064-bit",
    "x-rpc-game_biz": GAME_BIZ,
    "x-rpc-sdk_version": SDK_VERSION,
    Origin: "https://user.mihoyo.com",
    Referer: "https://user.mihoyo.com/",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0",
    "Content-Type": "application/json",
    Accept: "application/json, text/plain, */*",
  };
}

async function post(
  path: string,
  body: unknown,
): Promise<{ ok: boolean; data?: unknown; status?: number; error?: string }> {
  const url = `${PASSPORT_BASE}/${path}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: rpcHeaders(),
      body: JSON.stringify(body ?? {}),
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // 非 JSON 响应（如网关错误页）
    }
    return { ok: res.ok, data: json ?? undefined, status: res.status, error: res.ok ? undefined : text.slice(0, 200) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function get(path: string, params: Record<string, string>, useLegacy = false): Promise<unknown | null> {
  const base = useLegacy ? PASSPORT_LEGACY : PASSPORT_BASE;
  const url = new URL(`${base}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  try {
    const res = await fetch(url.toString(), { headers: rpcHeaders() });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

/** POST /api/auth/mihoyo/qr —— 创建扫码会话（带 token 为绑定模式，否则登录模式） */
export async function qrCreate(req: Request): Promise<Response> {
  if (!configured()) {
    return error(
      501,
      "米游社扫码未配置：请在环境变量设置 MIHOYO_APP_ID",
      "MIHOYO_NOT_CONFIGURED",
    );
  }
  const viewer = await resolveUser(req);
  const mode = viewer ? "bind" : "login";

  const result = await post("createQRLogin", {});
  const data = result?.data as { retcode?: number; message?: string; data?: { url?: string; ticket?: string; expire?: number } } | undefined;
  const d = data?.data;
  if (!result?.ok || !d?.url || !d?.ticket) {
    return error(
      502,
      `米游社返回异常：${data?.message || (result?.error ? `HTTP ${result.status} ${result.error}` : "未知错误")}`,
      "MIHOYO_QR_CREATE_FAILED",
    );
  }

  const ticket = d.ticket;
  const expiresIn = Math.max(30, Number(d.expire) || 180);
  await setJson(QR_SESSION(ticket), {
    ticket,
    mode,
    status: "waiting",
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + expiresIn * 1000,
    viewerId: viewer?.userId ?? null,
  });

  return json({ qrUrl: d.url, ticket, expiresIn, mode });
}

/** POST /api/auth/mihoyo/qr/status —— 轮询扫码状态 */
export async function qrStatus(req: Request): Promise<Response> {
  const { ticket } = await readJson<{ ticket?: string }>(req);
  if (!ticket) return badRequest("缺少 ticket");
  const session = await getJson<{
    mode?: string;
    status?: string;
    expiresAt?: number;
    viewerId?: string | null;
    tokenLog?: unknown[];
  }>(QR_SESSION(ticket));
  if (!session) return json({ status: "expired" });
  if (session.expiresAt && Date.now() > session.expiresAt) {
    await del(QR_SESSION(ticket));
    return json({ status: "expired" });
  }

  // 轮询扫码状态：POST queryQRLoginStatus { ticket }
  const qrData = (await post("queryQRLoginStatus", { ticket }))?.data as {
    retcode?: number;
    data?: {
      status?: string;
      tokens?: Array<{ token?: string; token_type?: number }>;
      user_info?: { uid?: string } | null;
    };
  } | undefined;
  let d = qrData?.data;
  const rawStatus = String(d?.status || "");

  // 状态枚举：Created(等待扫码) / Scanned(已扫码) / Confirmed(已确认) / Expired / Cancelled
  if (rawStatus.toLowerCase().includes("confirm")) {
    const userInfo = (d?.user_info || {}) as {
      aid?: string;
      mid?: string;
      account_name?: string;
      realname?: string;
      mobile?: string;
    };
    const aid = String(userInfo.aid || "");
    if (!aid) {
      return json({ status: "confirmed", mode: session.mode || "bind", binding: null, debug: d });
    }

    // confirmed 后 tokens 可能延迟就绪：连续重查（最多 10s），争取拿到 stoken
    const tokenLog: unknown[] = [];
    let stoken = d?.tokens?.find((t) => t?.token_type === 2)?.token || d?.tokens?.[0]?.token || "";
    tokenLog.push(d?.tokens ?? []);
    for (let i = 0; i < 5 && !stoken; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const retry = (await post("queryQRLoginStatus", { ticket }))?.data as {
        data?: {
          status?: string;
          tokens?: Array<{ token?: string; token_type?: number }>;
        };
      } | undefined;
      tokenLog.push(retry?.data?.tokens ?? []);
      stoken = retry?.data?.tokens?.find((t) => t?.token_type === 2)?.token || retry?.data?.tokens?.[0]?.token || "";
    }

    session.status = "confirmed";
    session.tokenLog = tokenLog;
    await setJson(QR_SESSION(ticket), session);
    return handleConfirmed(req, session, ticket, aid, stoken);
  }
  if (rawStatus.toLowerCase().includes("scan")) {
    session.status = "scanned";
    await setJson(QR_SESSION(ticket), session);
    return json({ status: "scanned" });
  }
  if (rawStatus.toLowerCase().includes("expire")) {
    await del(QR_SESSION(ticket));
    return json({ status: "expired" });
  }
  if (rawStatus.toLowerCase().includes("cancel")) {
    await del(QR_SESSION(ticket));
    return json({ status: "cancelled" });
  }
  // Created 或未识别：保持等待
  return json({ status: "waiting" });
}

/** 确认后处理：绑定模式写绑定；登录模式建号/登录
 *
 * 新版 ma-cn-passport 接口 confirmed 后用 user_info.aid（米游社账号 ID）完成绑定；
 * 若拿到 stoken 则换 cookie 拉取角色信息，失败不影响绑定。
 */
async function handleConfirmed(
  req: Request,
  session: { mode?: string; viewerId?: string | null; tokenLog?: unknown[] },
  ticket: string,
  accountId: string,
  stoken: string,
): Promise<Response> {
  // 尝试拿角色：有 stoken 则先换 cookie_token，再查角色
  let cookieHeader = "";
  let cookieDebug = "no-stoken";
  if (stoken) {
    const cookieData = (await get(
      "getCookieAccountInfoBySToken",
      { stoken, uid: accountId },
      true,
    )) as {
      retcode?: number;
      message?: string;
      data?: { cookie_token?: string; account_id?: string } | null;
    } | null;
    cookieDebug = `stoken=${stoken ? "yes" : "no"} retcode=${cookieData?.retcode ?? "null"} ${cookieData?.message || ""}`;
    const ck = cookieData?.data;
    if (ck?.cookie_token && ck?.account_id) {
      cookieHeader = `account_id=${ck.account_id};cookie_token=${ck.cookie_token}`;
    }
  }

  let zzzNickname: string | null = null;
  let zzzLevel: number | null = null;
  let zzzRegion = "";
  let zzzRegionName = "";
  let roleDebug = "no-cookie";
  if (cookieHeader) {
    try {
      const roleRes = await fetch(`${TAKUMI_BINDING}?game_biz=zzz_cn`, {
        headers: { Cookie: cookieHeader, "User-Agent": rpcHeaders()["User-Agent"] },
      });
      const roleData = (await roleRes.json()) as {
        retcode?: number;
        message?: string;
        data?: { list?: Array<{ game_biz?: string; nickname?: string; level?: number; region?: string; region_name?: string }> };
      };
      roleDebug = `retcode=${roleData?.retcode ?? "null"} ${roleData?.message || ""}`;
      const role = (roleData?.data?.list || []).find((r) => r?.game_biz === "zzz_cn");
      if (role) {
        zzzNickname = role.nickname || null;
        zzzLevel = role.level ?? null;
        zzzRegion = role.region || "";
        zzzRegionName = role.region_name || "";
      }
    } catch {
      roleDebug = "fetch-error";
    }
  }

  const binding = {
    aid: accountId,
    zzzUid: accountId,
    zzzNickname,
    zzzLevel,
    zzzRegion,
    zzzRegionName,
    lastSyncedAt: new Date().toISOString(),
    _debug: { cookie: cookieDebug, role: roleDebug, tokenLog: session.tokenLog ?? [] },
  };

  if (session.mode === "bind" && session.viewerId) {
    await setJson(BINDING(session.viewerId), { userId: session.viewerId, ...binding });
    // 建立 aid → userId 反查索引：之后用同一米游社账号扫码登录时能找到同一个用户
    await setJson(BY_MIHOYO(accountId), { document_id: session.viewerId });
    // 同步把本站用户 UID 更新为米游社账号 ID（非随机），保证个人主页 UID 一致
    if (/^\d+$/.test(accountId)) {
      const targetUser = await getJson<Doc>(userKey(session.viewerId));
      if (targetUser) {
        const newUid = Number(accountId);
        if (Number(targetUser.uid || 0) !== newUid) {
          const oldUid = Number(targetUser.uid);
          await setJson(userKey(session.viewerId), { ...targetUser, uid: newUid, mihoyo_id: accountId });
          if (oldUid) await del(`users/by-uid/${oldUid}.json`);
          await setJson(`users/by-uid/${newUid}.json`, { document_id: session.viewerId });
        }
      }
    }
    await del(QR_SESSION(ticket));
    return json({
      status: "confirmed",
      mode: "bind",
      binding,
      debug: { cookie: cookieDebug, role: roleDebug, tokenLog: session.tokenLog ?? [] },
    });
  }

  // 登录模式：查/建用户
  let idx = await getJson<{ document_id: string }>(BY_MIHOYO(accountId));
  // 兼容旧绑定：若索引缺失但已有绑定文档（bind 时未建索引），则把绑定用户作为登录用户
  if (!idx) {
    const keys = (await import("../storage")).listKeys;
    for (const key of await keys("mihoyo/bindings/")) {
      const doc = await getJson<{ userId?: string; aid?: string }>(key);
      if (doc && doc.userId && doc.aid === accountId) {
        idx = { document_id: doc.userId };
        await setJson(BY_MIHOYO(accountId), { document_id: doc.userId });
        break;
      }
    }
  }
  let user: Doc;
  if (idx) {
    const existing = await getJson<Doc>(userKey(idx.document_id));
    if (!existing) return error(500, "用户数据异常", "USER_NOT_FOUND");
    user = existing;
    // 若该米游社用户此前被分配了随机 UID，更新为米游社账号 ID 保持一致
    if (/^\d+$/.test(accountId) && Number(existing.uid || 0) !== Number(accountId)) {
      const oldUid = Number(existing.uid);
      const newUid = Number(accountId);
      await setJson(userKey(idx.document_id), { ...existing, uid: newUid });
      if (oldUid) await del(`users/by-uid/${oldUid}.json`);
      await setJson(`users/by-uid/${newUid}.json`, { document_id: idx.document_id });
      user = { ...existing, uid: newUid };
    }
  } else {
    const documentId = genId();
    const now = new Date().toISOString();
    const username = `mh${accountId}`.slice(0, 24);
    // 米游社账号 ID 即 UID（不随机生成）；若不可转为数字则兜底随机
    const uidNumber = /^\d+$/.test(accountId) ? Number(accountId) : await generateUid();
    user = {
      document_id: documentId,
      uid: uidNumber,
      username,
      name: zzzNickname || username,
      email: null,
      mihoyo_id: accountId,
      password_hash: null,
      avatar_url: DEFAULT_AVATAR,
      bio: "",
      level: 1,
      exp: 0,
      role: "user",
      status: "active",
      profile_hidden: false,
      created_at: now,
      stats: { articleCount: 0, commentCount: 0, totalViews: 0, totalLikes: 0, totalComments: 0 },
      followersCount: 0,
      followingCount: 0,
    };
    await setJson(userKey(documentId), user);
    await setJson(BY_MIHOYO(accountId), { document_id: documentId });
    await setJson(userUidKey(uidNumber), { document_id: documentId });
    await bumpStats({ userCount: 1 });
  }

  if (user.status !== "active") return error(403, "账号已被禁用", "USER_BLOCKED");
  const jwt = await signToken({
    documentId: String(user.document_id),
    username: String(user.username),
    role: String(user.role || "user"),
  });
  await del(QR_SESSION(ticket));
  return json({
    status: "confirmed",
    mode: "login",
    isNewUser: !idx,
    binding,
    jwt,
    user: toAuthor(user),
  });
}

/** GET /api/auth/mihoyo/binding —— 查询当前用户绑定 */
export async function binding(req: Request): Promise<Response> {
  const viewer = await resolveUser(req);
  if (!viewer) return json({ binding: null });
  const doc = await getJson<Record<string, unknown>>(BINDING(viewer.userId));
  if (doc && doc.zzzUid) {
    // 若用户 UID 仍是邮箱注册时的随机值，迁移为米游社账号 ID，保证个人主页 UID 一致
    const aid = String(doc.aid ?? doc.zzzUid);
    if (/^\d+$/.test(aid)) {
      const targetUser = await getJson<Doc>(userKey(viewer.userId));
      const newUid = Number(aid);
      if (targetUser && Number(targetUser.uid || 0) !== newUid) {
        const oldUid = Number(targetUser.uid);
        await setJson(userKey(viewer.userId), { ...targetUser, uid: newUid, mihoyo_id: aid });
        if (oldUid) await del(`users/by-uid/${oldUid}.json`);
        await setJson(`users/by-uid/${newUid}.json`, { document_id: viewer.userId });
      }
    }
  }
  return json({ binding: doc && doc.zzzUid ? doc : null });
}

/** DELETE /api/auth/mihoyo/binding —— 解绑 */
export async function unbind(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  await del(BINDING(viewer.userId));
  return ok({ success: true });
}
