/** GitHub OAuth 登录（基于 Blobs）：授权码 → access_token → 用户信息 → 建号/登录 */

import { genId, getJson, setJson, userKey, userEmailKey } from "../storage";
import { bumpStats } from "../feed";
import { signToken } from "../auth";
import { json, badRequest, error, readJson } from "../http";
import { toAuthor, DEFAULT_AVATAR, type Doc } from "../serialize";

const GITHUB_BY_ID = (id: number) => `users/by-github/${id}.json`;

const CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";

export async function callback(req: Request): Promise<Response> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return error(
      501,
      "GitHub 登录未配置：请在环境变量中设置 GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET",
      "GITHUB_NOT_CONFIGURED",
    );
  }

  const { code, redirectUri } = await readJson<{ code?: string; redirectUri?: string }>(req);
  if (!code) return badRequest("缺少授权码");
  const redirectUriValue = redirectUri || process.env.GITHUB_REDIRECT_URI || "";

  // 1. 授权码换 access_token（服务端持有 client_secret，绝不下发到前端）
  let tokenData: { access_token?: string; error?: string; error_description?: string };
  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: redirectUriValue,
      }),
    });
    tokenData = (await tokenRes.json()) as typeof tokenData;
  } catch {
    return error(502, "GitHub 授权服务暂不可用", "GITHUB_NETWORK_ERROR");
  }
  if (!tokenData.access_token) {
    return error(401, `GitHub 授权失败：${tokenData.error_description || tokenData.error || "未知错误"}`, "GITHUB_AUTH_FAILED");
  }

  // 2. 获取 GitHub 用户信息
  let gh: { id: number; login: string; name?: string | null; avatar_url?: string; email?: string | null };
  try {
    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/json",
        "User-Agent": "inter-knot",
      },
    });
    if (!userRes.ok) return error(502, "获取 GitHub 用户信息失败", "GITHUB_USER_FETCH_FAILED");
    gh = (await userRes.json()) as typeof gh;
  } catch {
    return error(502, "获取 GitHub 用户信息失败", "GITHUB_USER_FETCH_FAILED");
  }
  if (!gh || !gh.id) return error(502, "GitHub 返回数据异常", "GITHUB_USER_FETCH_FAILED");

  // 3. 查/建本站用户
  const idx = await getJson<{ document_id: string }>(GITHUB_BY_ID(gh.id));
  let user: Doc;
  if (idx) {
    const existing = await getJson<Doc>(userKey(idx.document_id));
    if (!existing) return error(500, "用户数据异常", "USER_NOT_FOUND");
    user = existing;
  } else {
    const documentId = genId();
    const now = new Date().toISOString();
    const username = String(gh.login || `gh${gh.id}`).slice(0, 24);
    const email = typeof gh.email === "string" && gh.email ? gh.email.toLowerCase() : null;
    let emailIndexed = false;
    if (email) {
      const taken = await getJson<{ document_id: string }>(userEmailKey(email));
      if (!taken) {
        await setJson(userEmailKey(email), { document_id: documentId });
        emailIndexed = true;
      }
    }
    user = {
      document_id: documentId,
      username,
      name: gh.name || gh.login || username,
      email: email && emailIndexed ? email : null,
      github_id: gh.id,
      password_hash: null,
      avatar_url: gh.avatar_url || DEFAULT_AVATAR,
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
    await setJson(GITHUB_BY_ID(gh.id), { document_id: documentId });
    await bumpStats({ userCount: 1 });
  }

  if (user.status !== "active") return error(403, "账号已被禁用", "USER_BLOCKED");

  const jwt = await signToken({
    documentId: String(user.document_id),
    username: String(user.username),
    role: String(user.role || "user"),
  });
  return json({ jwt, user: toAuthor(user) });
}
