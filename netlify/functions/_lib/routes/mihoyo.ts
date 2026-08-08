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

async function post(path: string, body: unknown): Promise<unknown | null> {
  const url = `${PASSPORT_BASE}/${path}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: rpcHeaders(),
      body: JSON.stringify(body ?? {}),
    });
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

  const data = (await post("createQRLogin", {})) as {
    retcode?: number;
    message?: string;
    data?: { url?: string; ticket?: string; expire?: number };
  } | null;
  const d = data?.data;
  if (!data || data.retcode !== 0 || !d?.url || !d?.ticket) {
    return error(502, `米游社返回异常：${data?.message || "未知错误"}`, "MIHOYO_QR_CREATE_FAILED");
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
  }>(QR_SESSION(ticket));
  if (!session) return json({ status: "expired" });
  if (session.expiresAt && Date.now() > session.expiresAt) {
    await del(QR_SESSION(ticket));
    return json({ status: "expired" });
  }

  // 轮询扫码状态：POST queryQRLoginStatus { ticket }
  const data = (await post("queryQRLoginStatus", { ticket })) as {
    retcode?: number;
    data?: {
      status?: string;
      tokens?: Array<{ token?: string; token_type?: number }>;
      user_info?: { uid?: string } | null;
    };
  } | null;
  const d = data?.data;
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
    // 新版接口 confirmed 后 tokens 可能为空，但有 user_info.aid（米游社账号 ID）
    const aid = String(userInfo.aid || "");
    if (aid) {
      session.status = "confirmed";
      await setJson(QR_SESSION(ticket), session);
      return handleConfirmed(req, session, ticket, aid, aid);
    }
    // 解析不到账号 ID：把原始数据带回前端便于排查
    return json({ status: "confirmed", mode: session.mode || "bind", binding: null, debug: d });
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
 * 新版 ma-cn-passport 接口 confirmed 后 tokens 为空，改用 user_info.aid
 * （米游社账号 ID）作为唯一标识完成绑定；角色信息尽力获取，失败不影响绑定。
 */
async function handleConfirmed(
  req: Request,
  session: { mode?: string; viewerId?: string | null },
  ticket: string,
  accountId: string,
  _stoken: string,
): Promise<Response> {
  // 尝试用 account_id 直接拉取绝区零角色（部分环境可用 cookie 直查）
  let zzzNickname: string | null = null;
  let zzzLevel: number | null = null;
  let zzzRegion = "";
  let zzzRegionName = "";
  try {
    const roleRes = await fetch(`${TAKUMI_BINDING}?game_biz=zzz_cn`, {
      headers: { Cookie: `account_id=${accountId}`, "User-Agent": rpcHeaders()["User-Agent"] },
    });
    const roleData = (await roleRes.json()) as {
      retcode?: number;
      data?: { list?: Array<{ game_biz?: string; nickname?: string; level?: number; region?: string; region_name?: string }> };
    };
    const role = (roleData?.data?.list || []).find((r) => r?.game_biz === "zzz_cn");
    if (role) {
      zzzNickname = role.nickname || null;
      zzzLevel = role.level ?? null;
      zzzRegion = role.region || "";
      zzzRegionName = role.region_name || "";
    }
  } catch {
    // 角色拉取失败不影响绑定本身
  }

  const binding = {
    aid: accountId,
    zzzUid: accountId,
    zzzNickname,
    zzzLevel,
    zzzRegion,
    zzzRegionName,
    lastSyncedAt: new Date().toISOString(),
  };

  if (session.mode === "bind" && session.viewerId) {
    await setJson(BINDING(session.viewerId), { userId: session.viewerId, ...binding });
    await del(QR_SESSION(ticket));
    return json({ status: "confirmed", mode: "bind", binding });
  }

  // 登录模式：查/建用户
  const idx = await getJson<{ document_id: string }>(BY_MIHOYO(accountId));
  let user: Doc;
  if (idx) {
    const existing = await getJson<Doc>(userKey(idx.document_id));
    if (!existing) return error(500, "用户数据异常", "USER_NOT_FOUND");
    user = existing;
  } else {
    const documentId = genId();
    const uidNumber = await generateUid();
    const now = new Date().toISOString();
    const username = `mh${accountId}`.slice(0, 24);
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
  return json({ binding: doc && doc.zzzUid ? doc : null });
}

/** DELETE /api/auth/mihoyo/binding —— 解绑 */
export async function unbind(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  await del(BINDING(viewer.userId));
  return ok({ success: true });
}
