var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// netlify/functions/_lib/storage.ts
var storage_exports = {};
__export(storage_exports, {
  DATA_STORE: () => DATA_STORE,
  KEYS: () => KEYS,
  blockKey: () => blockKey,
  categoryKey: () => categoryKey,
  codeKey: () => codeKey,
  commentKey: () => commentKey,
  del: () => del,
  exists: () => exists,
  favoriteKey: () => favoriteKey,
  followKey: () => followKey,
  genId: () => genId,
  getJson: () => getJson,
  getJsonWithEtag: () => getJsonWithEtag,
  likeKey: () => likeKey,
  listKeys: () => listKeys,
  postKey: () => postKey,
  readKey: () => readKey,
  reportKey: () => reportKey,
  setJson: () => setJson,
  setJsonIfMatch: () => setJsonIfMatch,
  setJsonOnce: () => setJsonOnce,
  uploadKey: () => uploadKey,
  userEmailKey: () => userEmailKey,
  userKey: () => userKey,
  userUidKey: () => userUidKey
});
import { getStore } from "@netlify/blobs";
function data() {
  return getStore(DATA_STORE);
}
async function getJson(key) {
  try {
    const value = await data().get(key, { type: "json", consistency: "strong" });
    return value ?? null;
  } catch {
    return null;
  }
}
async function setJson(key, value) {
  await data().setJSON(key, value);
}
async function setJsonOnce(key, value) {
  const res = await data().setJSON(key, value, { onlyIfNew: true });
  return res.modified;
}
async function del(key) {
  try {
    await data().delete(key);
  } catch {
  }
}
async function exists(key) {
  try {
    const meta = await data().getMetadata(key, { consistency: "strong" });
    return meta != null;
  } catch {
    return false;
  }
}
async function getJsonWithEtag(key) {
  try {
    const res = await data().getWithMetadata(key, { type: "json", consistency: "strong" });
    if (!res) return null;
    return { data: res.data, etag: res.etag || "" };
  } catch {
    return null;
  }
}
async function setJsonIfMatch(key, value, etag) {
  try {
    const res = await data().setJSON(key, value, { onlyIfMatch: etag });
    return res.modified;
  } catch {
    return false;
  }
}
async function listKeys(prefix) {
  const keys = [];
  for await (const page of data().list({ prefix, paginate: true })) {
    for (const blob of page.blobs) keys.push(blob.key);
  }
  return keys;
}
function genId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let value = 0n;
  for (const b of bytes) value = value * 256n + BigInt(b);
  let out = "";
  while (value > 0n && out.length < 13) {
    out = ALPHABET[Number(value % 62n)] + out;
    value = value / 62n;
  }
  while (out.length < 13) out = "0" + out;
  return out;
}
var DATA_STORE, ALPHABET, userKey, userEmailKey, userUidKey, categoryKey, postKey, commentKey, likeKey, favoriteKey, followKey, blockKey, readKey, reportKey, uploadKey, codeKey, KEYS;
var init_storage = __esm({
  "netlify/functions/_lib/storage.ts"() {
    "use strict";
    DATA_STORE = "data";
    ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    userKey = (id) => `users/${id}.json`;
    userEmailKey = (email) => `users/by-email/${email}.json`;
    userUidKey = (uid) => `users/by-uid/${uid}.json`;
    categoryKey = (id) => `categories/${id}.json`;
    postKey = (id) => `posts/${id}.json`;
    commentKey = (postId, id) => `comments/${postId}/${id}.json`;
    likeKey = (viewer, targetType, targetId) => `likes/${viewer}/${targetType}/${targetId}.json`;
    favoriteKey = (viewer, postId) => `favorites/${viewer}/${postId}.json`;
    followKey = (viewer, target) => `follows/${viewer}/${target}.json`;
    blockKey = (viewer, target) => `user_blocks/${viewer}/${target}.json`;
    readKey = (viewer, postId) => `read_records/${viewer}/${postId}.json`;
    reportKey = (viewer, targetType, targetId) => `reports/${viewer}/${targetType}/${targetId}.json`;
    uploadKey = (hash) => `uploads/${hash}.json`;
    codeKey = (purpose, email) => `verification_codes/${purpose}/${email}.json`;
    KEYS = {
      settings: "settings.json",
      stats: "stats.json",
      feed: "_indexes/feed.json",
      emotes: "emotes.json",
      drafts: (userId) => `_indexes/drafts/${userId}.json`,
      userComments: (userId) => `_indexes/user-comments/${userId}.json`,
      commentLookup: (commentId) => `_indexes/comment-lookup/${commentId}.json`
    };
  }
});

// netlify/functions/_lib/auth.ts
var auth_exports = {};
__export(auth_exports, {
  getBearerToken: () => getBearerToken,
  hashPassword: () => hashPassword,
  isApiThrow: () => isApiThrow,
  requireAdmin: () => requireAdmin,
  requireAuth: () => requireAuth,
  resolveUser: () => resolveUser,
  signToken: () => signToken,
  verifyPassword: () => verifyPassword,
  verifyToken: () => verifyToken
});
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}
async function verifyPassword(password, hash) {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}
async function signToken(user) {
  return new SignJWT({
    role: user.role,
    username: user.username
  }).setProtectedHeader({ alg: "HS256" }).setSubject(user.documentId).setIssuedAt().setExpirationTime(TOKEN_TTL).sign(SECRET);
}
async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    if (!sub) return null;
    return { documentId: sub };
  } catch {
    return null;
  }
}
function getBearerToken(req) {
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  return match ? match[1] : null;
}
async function resolveUser(req) {
  const token = getBearerToken(req);
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  const user = await getJson(userKey(payload.documentId));
  if (!user || user.status !== "active") return null;
  const role = String(user.role || "user");
  return {
    userId: payload.documentId,
    documentId: payload.documentId,
    username: String(user.username || ""),
    role,
    isAdmin: role === "admin"
  };
}
async function requireAuth(req) {
  const user = await resolveUser(req);
  if (!user) throw { __api: true, status: 401, message: "\u672A\u767B\u5F55\u6216\u767B\u5F55\u5DF2\u8FC7\u671F", code: "UNAUTHORIZED" };
  return user;
}
async function requireAdmin(req) {
  const user = await resolveUser(req);
  if (!user) throw { __api: true, status: 401, message: "\u672A\u767B\u5F55\u6216\u767B\u5F55\u5DF2\u8FC7\u671F", code: "UNAUTHORIZED" };
  if (user.role !== "admin") throw { __api: true, status: 403, message: "\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650", code: "FORBIDDEN" };
  return user;
}
function isApiThrow(err) {
  return !!err && typeof err === "object" && err.__api === true;
}
var SECRET_TEXT, SECRET, TOKEN_TTL;
var init_auth = __esm({
  "netlify/functions/_lib/auth.ts"() {
    "use strict";
    init_storage();
    SECRET_TEXT = process.env.JWT_SECRET || "dev-only-change-me";
    SECRET = new TextEncoder().encode(SECRET_TEXT);
    TOKEN_TTL = "7d";
  }
});

// netlify/functions/_lib/serialize.ts
var serialize_exports = {};
__export(serialize_exports, {
  DEFAULT_AVATAR: () => DEFAULT_AVATAR,
  toAuthor: () => toAuthor,
  toCategory: () => toCategory,
  toComment: () => toComment,
  toDraft: () => toDraft,
  toPost: () => toPost,
  toUploadedFile: () => toUploadedFile
});
function toAuthor(doc) {
  if (!doc) return null;
  const documentId = String(doc.document_id || "");
  const username = String(doc.username || "");
  if (!documentId && !username) return null;
  return {
    id: documentId,
    documentId,
    username,
    login: username,
    name: doc.name ? String(doc.name) : username,
    email: doc.email ? String(doc.email) : void 0,
    avatar: doc.avatar_url ? String(doc.avatar_url) : DEFAULT_AVATAR,
    level: Number(doc.level || 1),
    exp: Number(doc.exp || 0),
    isAiAgent: false,
    isAdmin: doc.role === "admin"
  };
}
function toPost(doc, state = {}) {
  if (!doc) return null;
  const documentId = String(doc.document_id || "");
  if (!documentId) return null;
  const covers = (Array.isArray(doc.covers) ? doc.covers : []).map((u) => {
    if (typeof u === "string") return { url: u };
    const c = u || {};
    return {
      documentId: c.document_id ? String(c.document_id) : c.documentId ? String(c.documentId) : void 0,
      url: String(c.url || ""),
      width: c.width != null ? Number(c.width) : void 0,
      height: c.height != null ? Number(c.height) : void 0
    };
  });
  const viewerId = state.viewer?.userId;
  const isOwner = viewerId != null && doc.author_document_id != null && String(viewerId) === String(doc.author_document_id);
  return {
    id: documentId,
    documentId,
    title: String(doc.title || "\u65E0\u6807\u9898"),
    body: doc.body ? String(doc.body) : "",
    text: doc.text ? String(doc.text) : "",
    rawBodyText: doc.text ? String(doc.text) : "",
    externalVideos: Array.isArray(doc.external_videos) ? doc.external_videos : [],
    covers,
    cover: covers[0]?.url || "",
    coverWidth: doc.cover_width != null ? Number(doc.cover_width) : void 0,
    coverHeight: doc.cover_height != null ? Number(doc.cover_height) : void 0,
    views: Number(doc.views || 0),
    likesCount: Number(doc.likes_count || 0),
    commentsCount: Number(doc.comments_count || 0),
    favoritesCount: Number(doc.favorites_count || 0),
    dennyCount: 0,
    hasGivenDenny: false,
    isRead: state.readIds ? state.readIds.has(documentId) : false,
    liked: state.likedIds ? state.likedIds.has(documentId) : false,
    favorited: state.favoritedIds ? state.favoritedIds.has(documentId) : false,
    isAnonymous: doc.is_anonymous === true,
    isHidden: doc.is_hidden === true,
    isOwner,
    category: doc.category_slug && doc.category_name ? { name: String(doc.category_name), slug: String(doc.category_slug) } : null,
    createdAt: String(doc.created_at || ""),
    updatedAt: String(doc.updated_at || ""),
    editedAt: void 0,
    author: toAuthor({
      document_id: doc.author_document_id,
      username: doc.author_username,
      name: doc.author_name,
      avatar_url: doc.author_avatar_url,
      level: doc.author_level,
      exp: doc.author_exp
    }) || { name: "\u5DF2\u6CE8\u9500", username: "unknown", avatar: DEFAULT_AVATAR, level: 1, exp: 0 }
  };
}
function toComment(doc, likedIds) {
  if (!doc) return null;
  const documentId = String(doc.document_id || "");
  if (!documentId) return null;
  const images = Array.isArray(doc.images) ? doc.images.map((u) => typeof u === "string" ? u : String(u?.url || "")).filter(Boolean) : [];
  return {
    id: documentId,
    documentId,
    content: String(doc.content || ""),
    images: images.map((url) => ({ url })),
    liked: likedIds ? likedIds.has(documentId) : false,
    likesCount: Number(doc.likes_count || 0),
    createdAt: String(doc.created_at || ""),
    isPinned: doc.is_pinned === true,
    pinnedAt: void 0,
    floor: doc.floor != null ? Number(doc.floor) : void 0,
    author: toAuthor({
      document_id: doc.author_document_id,
      username: doc.author_username,
      name: doc.author_name,
      avatar_url: doc.author_avatar_url,
      level: doc.author_level,
      exp: doc.author_exp
    }) || { name: "\u5DF2\u6CE8\u9500", username: "unknown", avatar: DEFAULT_AVATAR, level: 1, exp: 0 }
  };
}
function toCategory(doc) {
  return {
    documentId: String(doc.document_id || ""),
    name: String(doc.name || ""),
    slug: String(doc.slug || ""),
    order: doc.sort_order != null ? Number(doc.sort_order) : void 0,
    adminOnly: doc.is_admin_only === true,
    description: String(doc.description || ""),
    icon: String(doc.icon || ""),
    isHidden: doc.is_hidden === true,
    sortOrder: doc.sort_order != null ? Number(doc.sort_order) : void 0,
    createdAt: String(doc.created_at || "")
  };
}
function toDraft(doc) {
  const covers = (Array.isArray(doc.covers) ? doc.covers : []).map((u) => {
    if (typeof u === "string") return { url: u };
    const c = u || {};
    return {
      documentId: c.document_id ? String(c.document_id) : c.documentId ? String(c.documentId) : void 0,
      url: String(c.url || ""),
      width: c.width != null ? Number(c.width) : void 0,
      height: c.height != null ? Number(c.height) : void 0
    };
  });
  return {
    documentId: String(doc.document_id || ""),
    id: String(doc.document_id || ""),
    title: String(doc.title || ""),
    text: String(doc.text || ""),
    editorState: Array.isArray(doc.editor_state) ? doc.editor_state : void 0,
    externalVideos: Array.isArray(doc.external_videos) ? doc.external_videos : [],
    cover: covers,
    hasPublishedVersion: false,
    category: doc.category_slug && doc.category_name ? { name: String(doc.category_name), slug: String(doc.category_slug) } : null,
    createdAt: String(doc.created_at || ""),
    updatedAt: String(doc.updated_at || "")
  };
}
function toUploadedFile(doc) {
  const documentId = String(doc.document_id || "");
  return {
    id: documentId,
    documentId,
    name: doc.name ? String(doc.name) : void 0,
    url: String(doc.url || ""),
    mime: doc.mime ? String(doc.mime) : "image/webp",
    size: doc.size != null ? Number(doc.size) : void 0,
    width: doc.width != null ? Number(doc.width) : void 0,
    height: doc.height != null ? Number(doc.height) : void 0,
    createdAt: String(doc.created_at || "")
  };
}
var DEFAULT_AVATAR;
var init_serialize = __esm({
  "netlify/functions/_lib/serialize.ts"() {
    "use strict";
    DEFAULT_AVATAR = "/images/default-avatar.webp";
  }
});

// netlify/functions/_lib/seed.ts
init_storage();
init_auth();

// netlify/functions/_lib/uid.ts
init_storage();
async function generateUid() {
  for (let i = 0; i < 100; i += 1) {
    const uid = 1e7 + Math.floor(Math.random() * 9e7);
    const taken = await getJson(userUidKey(uid));
    if (!taken) return uid;
  }
  return Number(String(Date.now()).slice(-8));
}

// netlify/functions/_lib/seed.ts
var SEED_VERSION = 4;
var SEED_META_KEY = "_meta.seed";
var DEFAULT_CATEGORIES = [
  { name: "\u7EFC\u5408\u8BA8\u8BBA", slug: "general", description: "\u95F2\u804A\u4E0E\u7EFC\u5408\u8BA8\u8BBA", icon: "", order: 1 },
  { name: "\u6E38\u620F\u4EA4\u6D41", slug: "game", description: "\u6E38\u620F\u653B\u7565\u3001\u7248\u672C\u3001\u5361\u6C60\u8BA8\u8BBA", icon: "", order: 2 },
  { name: "\u540C\u4EBA\u521B\u4F5C", slug: "creation", description: "\u540C\u4EBA\u56FE\u3001\u6587\u3001\u89C6\u9891\u521B\u4F5C\u5206\u4EAB", icon: "", order: 3 },
  { name: "\u6280\u672F\u5206\u4EAB", slug: "tech", description: "\u5F00\u53D1\u3001\u5DE5\u5177\u4E0E\u9ED1\u79D1\u6280", icon: "", order: 4 },
  { name: "\u516C\u544A", slug: "announce", description: "\u5E73\u53F0\u516C\u544A\uFF08\u4EC5\u7BA1\u7406\u5458\u53D1\u5E03\uFF09", icon: "", order: 99, adminOnly: true }
];
async function categoryExists(slug) {
  const keys = await listKeys("categories/");
  for (const key of keys) {
    const c = await getJson(key);
    if (c && c.slug === slug) return true;
  }
  return false;
}
async function ensureSeed() {
  const settings2 = await getJson(KEYS.settings);
  if (!settings2) {
    const gained = await setJsonOnce(KEYS.settings, {
      siteName: "\u7EF3\u7F51",
      announcement: "",
      allowRegister: true,
      needAudit: false
    });
    if (!gained) return;
    for (const c of DEFAULT_CATEGORIES) {
      if (await categoryExists(c.slug)) continue;
      const id = genId();
      await setJson(categoryKey(id), {
        document_id: id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        icon: c.icon,
        sort_order: c.order,
        is_hidden: false,
        is_admin_only: c.adminOnly ?? false,
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    const adminEmail = (process.env.ADMIN_INITIAL_EMAIL || "admin@example.com").toLowerCase();
    if (!await getJson(userEmailKey(adminEmail))) {
      const adminDocumentId = genId();
      const uid = await generateUid();
      const passHash = await hashPassword(process.env.ADMIN_INITIAL_PASSWORD || "admin123456");
      await setJson(userKey(adminDocumentId), {
        document_id: adminDocumentId,
        uid,
        username: "\u7BA1\u7406\u5458",
        name: "\u7BA1\u7406\u5458",
        email: adminEmail,
        password_hash: passHash,
        avatar_url: "/images/default-avatar.webp",
        bio: "",
        level: 1,
        exp: 0,
        role: "admin",
        status: "active",
        profile_hidden: false,
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        stats: { articleCount: 0, commentCount: 0, totalViews: 0, totalLikes: 0, totalComments: 0 },
        followersCount: 0,
        followingCount: 0
      });
      await setJson(userEmailKey(adminEmail), { document_id: adminDocumentId });
      await setJson(userUidKey(uid), { document_id: adminDocumentId });
    }
    await setJson(KEYS.stats, { userCount: 1, postCount: 0, commentCount: 0, viewCount: 0 });
    await setJson(KEYS.feed, { posts: [] });
  }
  const meta = await getJson(SEED_META_KEY) ?? {};
  if (Number(meta.seedVersion || 0) < SEED_VERSION) {
    await cleanupDuplicates();
    await fixCategoryIds();
    await setJson(SEED_META_KEY, { seedVersion: SEED_VERSION });
  }
}
async function fixCategoryIds() {
  const catKeys = await listKeys("categories/");
  for (const key of catKeys) {
    const c = await getJson(key);
    if (!c) continue;
    const idFromKey = key.slice("categories/".length, -".json".length);
    const currentDocId = String(c.document_id || "");
    if (currentDocId && currentDocId !== idFromKey) {
      await setJson(key, { ...c, document_id: idFromKey });
    }
  }
}
async function cleanupDuplicates() {
  const catKeys = await listKeys("categories/");
  const seen = /* @__PURE__ */ new Map();
  for (const key of catKeys) {
    const c = await getJson(key);
    if (!c || !c.slug) continue;
    const existing = seen.get(c.slug);
    if (existing) {
      await del(key);
    } else {
      seen.set(c.slug, key);
    }
  }
  const userKeys = (await listKeys("users/")).filter((k) => !k.includes("/by-email/"));
  const byEmail = /* @__PURE__ */ new Map();
  for (const key of userKeys) {
    const u = await getJson(key);
    if (!u || !u.email) continue;
    const list3 = byEmail.get(u.email) || [];
    list3.push(key);
    byEmail.set(u.email, list3);
  }
  for (const [email, keys] of byEmail) {
    if (keys.length <= 1) continue;
    const idx = await getJson(userEmailKey(email));
    let keepKey = null;
    for (const key of keys) {
      const u = await getJson(key);
      if (idx && u?.document_id === idx.document_id) keepKey = key;
    }
    if (!keepKey) keepKey = keys[0];
    for (const key of keys) {
      if (key !== keepKey) await del(key);
    }
    const kept = await getJson(keepKey);
    if (kept?.document_id) await setJson(userEmailKey(email), { document_id: kept.document_id });
  }
  const uidKeys = (await listKeys("users/")).filter(
    (k) => !k.includes("/by-email/") && !k.includes("/by-uid/")
  );
  for (const key of uidKeys) {
    const u = await getJson(key);
    if (!u || u.uid != null) continue;
    const documentId = String(u.document_id || "");
    if (!documentId) continue;
    const uid = await generateUid();
    await setJson(key, { ...u, uid });
    await setJson(userUidKey(uid), { document_id: documentId });
  }
}

// netlify/functions/_lib/http.ts
function json(data2, init = {}) {
  return new Response(JSON.stringify(data2), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json; charset=utf-8", ...init.headers || {} }
  });
}
function ok(data2, meta) {
  const body = { data: data2 };
  if (meta) body.meta = meta;
  return json(body);
}
function paginated(data2, start, limit, total) {
  return ok(data2, {
    pagination: {
      start,
      limit,
      total,
      pageCount: limit > 0 ? Math.ceil(total / limit) : 0
    }
  });
}
function error(statusCode, message, code, details) {
  return json(
    { error: { message, code: code || "ERROR", details } },
    { status: statusCode }
  );
}
function badRequest(message, code) {
  return error(400, message, code || "BAD_REQUEST");
}
function unauthorized(message = "\u672A\u767B\u5F55\u6216\u767B\u5F55\u5DF2\u8FC7\u671F") {
  return error(401, message, "UNAUTHORIZED");
}
function notFound(message = "\u8D44\u6E90\u4E0D\u5B58\u5728") {
  return error(404, message, "NOT_FOUND");
}
async function readJson(req) {
  try {
    const body = await req.json();
    return body ?? {};
  } catch {
    return {};
  }
}
function queryParams(req) {
  return new URL(req.url).searchParams;
}
function bool(input) {
  return input === true || input === "true" || input === "1";
}
function int(input, fallback = 0) {
  const n = Number(input);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

// netlify/functions/api.ts
init_auth();

// netlify/functions/_lib/routes/auth.ts
init_storage();
import { createHmac, randomInt } from "node:crypto";

// netlify/functions/_lib/feed.ts
init_storage();
var FEED_CAP = 1e3;
async function getFeed() {
  const feed = await getJson(KEYS.feed);
  return Array.isArray(feed?.posts) ? feed.posts : [];
}
async function mutateFeed(mutate) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const cur = await getJsonWithEtag(KEYS.feed);
    if (!cur) {
      await setJson(KEYS.feed, { posts: mutate([]) });
      return;
    }
    const posts2 = Array.isArray(cur.data?.posts) ? cur.data.posts : [];
    const next = mutate(posts2);
    const ok2 = await setJsonIfMatch(KEYS.feed, { posts: next }, cur.etag);
    if (ok2) return;
  }
}
async function feedAdd(doc) {
  await mutateFeed((posts2) => {
    const next = [doc, ...posts2];
    if (next.length > FEED_CAP) next.length = FEED_CAP;
    return next;
  });
}
async function feedRemove(documentId) {
  await mutateFeed((posts2) => posts2.filter((p) => p.document_id !== documentId));
}
async function feedUpdate(documentId, patch) {
  await mutateFeed(
    (posts2) => posts2.map((p) => p.document_id === documentId ? { ...p, ...patch } : p)
  );
}
async function feedUpsert(doc) {
  await mutateFeed((posts2) => {
    const idx = posts2.findIndex((p) => p.document_id === doc.document_id);
    const next = idx >= 0 ? posts2.map((p, i) => i === idx ? { ...p, ...doc } : p) : [doc, ...posts2];
    if (next.length > FEED_CAP) next.length = FEED_CAP;
    return next;
  });
}
async function getStats() {
  const s = await getJson(KEYS.stats);
  return s ?? {};
}
async function bumpStats(patch) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const cur = await getJsonWithEtag(KEYS.stats);
    if (!cur) {
      await setJson(KEYS.stats, { ...patch });
      return;
    }
    const next = { ...cur.data };
    for (const [k, v] of Object.entries(patch)) {
      next[k] = Math.max(0, Number(next[k] || 0) + v);
    }
    if (await setJsonIfMatch(KEYS.stats, next, cur.etag)) return;
  }
}
async function getUser(docId) {
  return getJson(userKey(docId));
}
async function updateUserStats(userId, delta) {
  const u = await getUser(userId);
  if (!u) return;
  const stats2 = u.stats || {};
  for (const [k, v] of Object.entries(delta)) {
    stats2[k] = Math.max(0, Number(stats2[k] || 0) + v);
  }
  await setJson(userKey(userId), { ...u, stats: stats2 });
}
async function updateUserCounts(userId, delta) {
  const u = await getUser(userId);
  if (!u) return;
  const next = { ...u };
  for (const [k, v] of Object.entries(delta)) {
    next[k] = Math.max(0, Number(next[k] || 0) + v);
  }
  await setJson(userKey(userId), next);
}

// netlify/functions/_lib/routes/auth.ts
init_auth();
init_serialize();
var BYPASS_CODE = process.env.BYPASS_EMAIL_CODE !== "false";
var CODE_TTL_SECONDS = 10 * 60;
var SEND_COOLDOWN_SECONDS = 60;
var MAX_VERIFY_ATTEMPTS = 5;
var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var CODE_PATTERN = /^\d{6}$/;
function codeSecret() {
  return process.env.REGISTER_CODE_SECRET || process.env.JWT_SECRET || "dev-only-change-me";
}
function codeHash(email, code) {
  return createHmac("sha256", codeSecret()).update(`${email}:${code}`).digest("hex");
}
function generateCode() {
  return String(randomInt(0, 1e6)).padStart(6, "0");
}
function emailOf(input) {
  return String(input || "").trim().toLowerCase();
}
async function findUserByEmail(email) {
  const idx = await getJson(userEmailKey(email));
  if (!idx) return null;
  return getJson(userKey(idx.document_id));
}
async function siteSettings() {
  return await getJson(KEYS.settings) ?? {};
}
async function cooldownRemaining(email, purpose) {
  const rec = await getJson(codeKey(purpose, email));
  if (!rec?.sent_at) return 0;
  const elapsed = (Date.now() - new Date(rec.sent_at).getTime()) / 1e3;
  return Math.max(0, Math.ceil(SEND_COOLDOWN_SECONDS - elapsed));
}
async function issueVerificationCode(email, purpose) {
  const now = /* @__PURE__ */ new Date();
  const code = generateCode();
  await setJson(codeKey(purpose, email), {
    purpose,
    code_hash: codeHash(email, code),
    expires_at: new Date(now.getTime() + CODE_TTL_SECONDS * 1e3).toISOString(),
    sent_at: now.toISOString(),
    attempts: 0
  });
}
async function verifyAndConsume(email, purpose, code) {
  const rec = await getJson(codeKey(purpose, email));
  if (!rec) return { ok: false };
  if (rec.expires_at && new Date(rec.expires_at).getTime() <= Date.now()) {
    await del(codeKey(purpose, email));
    return { ok: false };
  }
  const attempts = Number(rec.attempts || 0);
  if (attempts >= MAX_VERIFY_ATTEMPTS) {
    await del(codeKey(purpose, email));
    return { ok: false };
  }
  const valid = BYPASS_CODE ? CODE_PATTERN.test(code) : rec.code_hash === codeHash(email, code);
  if (!valid) {
    const next = attempts + 1;
    if (next >= MAX_VERIFY_ATTEMPTS) await del(codeKey(purpose, email));
    else await setJson(codeKey(purpose, email), { ...rec, attempts: next });
    return { ok: false, attemptsRemaining: Math.max(0, MAX_VERIFY_ATTEMPTS - next) };
  }
  await del(codeKey(purpose, email));
  return { ok: true };
}
async function login(req) {
  const { identifier, password } = await readJson(req);
  const email = emailOf(identifier);
  if (!email || !password) return badRequest("\u8BF7\u8F93\u5165\u90AE\u7BB1\u548C\u5BC6\u7801");
  const user = await findUserByEmail(email);
  if (!user || !user.password_hash) return unauthorized("\u90AE\u7BB1\u6216\u5BC6\u7801\u9519\u8BEF");
  const okPass = await verifyPassword(password, String(user.password_hash));
  if (!okPass) return unauthorized("\u90AE\u7BB1\u6216\u5BC6\u7801\u9519\u8BEF");
  if (user.status !== "active") return error(403, "\u8D26\u53F7\u5DF2\u88AB\u7981\u7528", "USER_BLOCKED");
  const token = await signToken({
    documentId: String(user.document_id),
    username: String(user.username),
    role: String(user.role || "user")
  });
  return json({ jwt: token, user: toAuthor(user) });
}
async function sendRegisterCode(req) {
  const { email } = await readJson(req);
  const e = emailOf(email);
  if (e.length < 6 || !EMAIL_PATTERN.test(e)) return badRequest("\u90AE\u7BB1\u683C\u5F0F\u4E0D\u6B63\u786E", "INVALID_EMAIL");
  const settings2 = await siteSettings();
  if (settings2.allowRegister === false) return error(403, "\u5F53\u524D\u4E0D\u5141\u8BB8\u6CE8\u518C", "REGISTER_DISABLED");
  if (await findUserByEmail(e)) return badRequest("\u8BE5\u90AE\u7BB1\u5DF2\u6CE8\u518C", "EMAIL_TAKEN");
  const wait = await cooldownRemaining(e, "register");
  if (wait > 0) return error(429, "\u9A8C\u8BC1\u7801\u53D1\u9001\u8FC7\u4E8E\u9891\u7E41\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5", "REGISTER_CODE_COOLDOWN", { retryAfter: wait });
  await issueVerificationCode(e, "register");
  return json({ email: e, sent: true, expiresIn: CODE_TTL_SECONDS, cooldown: SEND_COOLDOWN_SECONDS });
}
async function registerWithCode(req) {
  const { email, code, password } = await readJson(req);
  const e = emailOf(email);
  const c = String(code || "").trim();
  if (!e || !c) return badRequest("\u8BF7\u586B\u5199\u90AE\u7BB1\u4E0E\u9A8C\u8BC1\u7801");
  if (!CODE_PATTERN.test(c)) return badRequest("\u9A8C\u8BC1\u7801\u5FC5\u987B\u662F 6 \u4F4D\u6570\u5B57", "INVALID_VERIFICATION_CODE");
  if (!password || password.length < 6) return badRequest("\u5BC6\u7801\u81F3\u5C11 6 \u4F4D", "INVALID_PASSWORD");
  const settings2 = await siteSettings();
  if (settings2.allowRegister === false) return error(403, "\u5F53\u524D\u4E0D\u5141\u8BB8\u6CE8\u518C", "REGISTER_DISABLED");
  if (await findUserByEmail(e)) return badRequest("\u8BE5\u90AE\u7BB1\u5DF2\u6CE8\u518C", "EMAIL_TAKEN");
  const verify = await verifyAndConsume(e, "register", c);
  if (!verify.ok) {
    return error(400, "\u9A8C\u8BC1\u7801\u9519\u8BEF\u6216\u5DF2\u8FC7\u671F", "REGISTER_CODE_INVALID", {
      attemptsRemaining: verify.attemptsRemaining
    });
  }
  const username = `\u7528\u6237${genId().slice(0, 6)}`;
  const documentId = genId();
  const uid = await generateUid();
  const passHash = await hashPassword(password);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const user = {
    document_id: documentId,
    uid,
    username,
    name: username,
    email: e,
    password_hash: passHash,
    avatar_url: "/images/default-avatar.webp",
    bio: "",
    level: 1,
    exp: 0,
    role: "user",
    status: "active",
    profile_hidden: false,
    created_at: now,
    stats: { articleCount: 0, commentCount: 0, totalViews: 0, totalLikes: 0, totalComments: 0 },
    followersCount: 0,
    followingCount: 0
  };
  await setJson(userKey(documentId), user);
  await setJson(userEmailKey(e), { document_id: documentId });
  await setJson(userUidKey(uid), { document_id: documentId });
  await bumpStats({ userCount: 1 });
  const token = await signToken({ documentId, username, role: "user" });
  return json({ jwt: token, user: toAuthor(user) });
}
async function sendResetCode(req) {
  const { email } = await readJson(req);
  const e = emailOf(email);
  if (!e) return badRequest("\u8BF7\u8F93\u5165\u90AE\u7BB1");
  const wait = await cooldownRemaining(e, "reset");
  if (wait > 0) return error(429, "\u9A8C\u8BC1\u7801\u53D1\u9001\u8FC7\u4E8E\u9891\u7E41\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5", "RESET_CODE_COOLDOWN", { retryAfter: wait });
  if (await findUserByEmail(e)) await issueVerificationCode(e, "reset");
  return json({ email: e, sent: true, expiresIn: CODE_TTL_SECONDS, cooldown: SEND_COOLDOWN_SECONDS });
}
async function resetPassword(req) {
  const { email, code, password } = await readJson(req);
  const e = emailOf(email);
  const c = String(code || "").trim();
  if (!e || !c) return badRequest("\u8BF7\u586B\u5199\u90AE\u7BB1\u4E0E\u9A8C\u8BC1\u7801");
  if (!CODE_PATTERN.test(c)) return badRequest("\u9A8C\u8BC1\u7801\u5FC5\u987B\u662F 6 \u4F4D\u6570\u5B57", "INVALID_VERIFICATION_CODE");
  if (!password || password.length < 6) return badRequest("\u5BC6\u7801\u81F3\u5C11 6 \u4F4D", "INVALID_PASSWORD");
  const user = await findUserByEmail(e);
  if (!user) return badRequest("\u9A8C\u8BC1\u7801\u65E0\u6548\u6216\u5DF2\u8FC7\u671F");
  const verify = await verifyAndConsume(e, "reset", c);
  if (!verify.ok) {
    return error(400, "\u9A8C\u8BC1\u7801\u9519\u8BEF\u6216\u5DF2\u8FC7\u671F", "REGISTER_CODE_INVALID", {
      attemptsRemaining: verify.attemptsRemaining
    });
  }
  const passHash = await hashPassword(password);
  await setJson(userKey(String(user.document_id)), { ...user, password_hash: passHash });
  return json({ success: true });
}
async function renew(req) {
  const token = getBearerToken(req);
  if (!token) return unauthorized();
  const payload = await verifyToken(token);
  if (!payload) return unauthorized();
  const user = await getJson(userKey(payload.documentId));
  if (!user || user.status !== "active") return unauthorized();
  const jwt = await signToken({
    documentId: String(user.document_id),
    username: String(user.username),
    role: String(user.role || "user")
  });
  return json({ jwt });
}
async function meProfile(req) {
  const viewer = await requireAuth(req);
  const user = await getJson(userKey(viewer.userId));
  if (!user) return unauthorized();
  const author = toAuthor(user) || {};
  return json({
    ...author,
    profileHidden: user.profile_hidden === true,
    examPassed: true,
    isAdmin: viewer.isAdmin
  });
}

// netlify/functions/_lib/routes/articles.ts
init_storage();
init_auth();
init_serialize();
var PAGE_SIZE = 20;
var UPLOAD_BY_DOC = (id) => `uploads/by-document/${id}.json`;
async function draftIds(userId) {
  return await getJson(KEYS.drafts(userId)) ?? [];
}
async function addDraft(userId, id) {
  const ids = await draftIds(userId);
  if (!ids.includes(id)) {
    ids.unshift(id);
    await setJson(KEYS.drafts(userId), ids);
  }
}
async function removeDraft(userId, id) {
  const ids = (await draftIds(userId)).filter((x) => x !== id);
  await setJson(KEYS.drafts(userId), ids);
}
async function categoryBySlug(slug) {
  if (!slug) return null;
  const keys = await listKeys("categories/");
  for (const k of keys) {
    const c = await getJson(k);
    if (c && c.slug === slug) return c;
  }
  return null;
}
async function authorFields(userId) {
  const u = await getUser(userId);
  return {
    author_id: userId,
    author_document_id: userId,
    author_username: u?.username || "",
    author_name: u?.name || u?.username || "",
    author_avatar_url: u?.avatar_url || DEFAULT_AVATAR,
    author_level: u?.level ?? 1,
    author_exp: u?.exp ?? 0
  };
}
async function resolveCovers(input) {
  const ids = Array.isArray(input) ? input.map(String) : input ? [String(input)] : [];
  const covers = [];
  for (const id of ids) {
    const meta = await getJson(UPLOAD_BY_DOC(id));
    if (meta?.url) {
      covers.push({
        documentId: id,
        url: String(meta.url),
        width: meta.width != null ? Number(meta.width) : void 0,
        height: meta.height != null ? Number(meta.height) : void 0
      });
    }
  }
  return { covers, width: covers[0]?.width, height: covers[0]?.height };
}
async function getPostDoc(documentId) {
  return getJson(postKey(documentId));
}
async function touchPost(documentId, patch) {
  const doc = await getPostDoc(documentId);
  if (doc) await setJson(postKey(documentId), { ...doc, ...patch });
  await feedUpdate(documentId, patch);
}
async function viewerState(viewer, ids) {
  const state = { viewer, likedIds: /* @__PURE__ */ new Set(), favoritedIds: /* @__PURE__ */ new Set(), readIds: /* @__PURE__ */ new Set() };
  if (!viewer || ids.length === 0) return state;
  const [liked, favorited, read] = await Promise.all([
    Promise.all(ids.map((id) => exists(likeKey(viewer.userId, "article", id)))),
    Promise.all(ids.map((id) => exists(favoriteKey(viewer.userId, id)))),
    Promise.all(ids.map((id) => exists(readKey(viewer.userId, id))))
  ]);
  ids.forEach((id, i) => {
    if (liked[i]) state.likedIds.add(id);
    if (favorited[i]) state.favoritedIds.add(id);
    if (read[i]) state.readIds.add(id);
  });
  return state;
}
async function listPosts(req, opts) {
  const viewer = await resolveUser(req);
  let posts2 = await getFeed();
  if (opts.category) posts2 = posts2.filter((p) => p.category_slug === opts.category);
  if (opts.q) {
    const q = opts.q.toLowerCase();
    posts2 = posts2.filter((p) => String(p.title || "").toLowerCase().includes(q) || String(p.text || "").toLowerCase().includes(q));
  }
  if (viewer) {
    const blocked = new Set((await listKeys(`user_blocks/${viewer.userId}/`)).map((k) => k.split("/")[2]));
    posts2 = posts2.filter((p) => !blocked.has(String(p.author_document_id)));
    if (opts.feed === "following") {
      const follows = new Set((await listKeys(`follows/${viewer.userId}/`)).map((k) => k.split("/")[2]));
      posts2 = posts2.filter((p) => follows.has(String(p.author_document_id)));
    } else if (opts.feed === "favorites") {
      const favs = new Set((await listKeys(`favorites/${viewer.userId}/`)).map((k) => k.split("/")[2]));
      posts2 = posts2.filter((p) => favs.has(String(p.document_id)));
    }
  } else if (opts.feed !== "recommend") {
    return paginated([], opts.start, opts.limit, 0);
  }
  const total = posts2.length;
  const page = posts2.slice(opts.start, opts.start + opts.limit);
  const state = await viewerState(viewer, page.map((p) => String(p.document_id)));
  const nodes = page.map((p) => toPost(p, state)).filter(Boolean);
  return paginated(nodes, opts.start, opts.limit, total);
}
async function list(req) {
  const qp = queryParams(req);
  const start = Math.max(0, int(qp.get("start")));
  const limit = Math.min(50, Math.max(1, int(qp.get("limit"), PAGE_SIZE)));
  return listPosts(req, {
    start,
    limit,
    q: qp.get("q") || "",
    category: qp.get("category") || "",
    feed: qp.get("feed") || "recommend"
  });
}
async function suggest(req) {
  const qp = queryParams(req);
  const q = (qp.get("q") || "").trim().toLowerCase();
  if (!q) return ok([]);
  const feed = await getFeed();
  const hits = feed.filter((p) => String(p.title || "").toLowerCase().includes(q)).slice(0, 8).map((p) => ({
    documentId: String(p.document_id),
    title: String(p.title || ""),
    titleHighlighted: String(p.title || ""),
    excerpt: String(p.text || "").slice(0, 60),
    authorName: p.author_name ? String(p.author_name) : null,
    categoryName: p.category_name ? String(p.category_name) : null,
    categorySlug: p.category_slug ? String(p.category_slug) : null,
    isAnonymous: p.is_anonymous === true
  }));
  return ok(hits);
}
async function detail(req) {
  const id = decodeURIComponent(req.url.split("?")[0].split("/").filter(Boolean).pop() || "");
  const viewer = await resolveUser(req);
  const doc = await getPostDoc(id);
  if (!doc || doc.status === "deleted") return notFound("\u5E16\u5B50\u4E0D\u5B58\u5728");
  if (doc.status !== "published" && doc.status !== "pending") {
    const isOwner = viewer != null && String(doc.author_document_id) === viewer.userId;
    if (!isOwner && viewer?.role !== "admin") return notFound("\u5E16\u5B50\u4E0D\u5B58\u5728");
  }
  if (doc.is_hidden === true && viewer?.role !== "admin" && String(doc.author_document_id) !== viewer?.userId) {
    return notFound("\u5E16\u5B50\u4E0D\u5B58\u5728");
  }
  const state = await viewerState(viewer, [id]);
  const views = Number(doc.views || 0) + 1;
  await touchPost(id, { views, updated_at: String(doc.updated_at || "") });
  const post = toPost({ ...doc, views }, state);
  return ok(post);
}
async function view(req) {
  const segments2 = req.url.split("?")[0].split("/").filter(Boolean);
  const id = decodeURIComponent(segments2[segments2.length - 2] || "");
  const doc = await getPostDoc(id);
  if (!doc) return notFound();
  const views = Number(doc.views || 0) + 1;
  await touchPost(id, { views, updated_at: String(doc.updated_at || "") });
  return json({ views });
}
async function parseDraftBody(req) {
  const body = await readJson(req);
  return body.data || {};
}
async function applyBodyToDoc(data2, doc) {
  if (data2.title !== void 0) doc.title = String(data2.title).slice(0, 200);
  if (data2.text !== void 0) doc.text = String(data2.text);
  if (data2.editorState !== void 0) doc.editor_state = data2.editorState;
  if (data2.externalVideos !== void 0) doc.external_videos = Array.isArray(data2.externalVideos) ? data2.externalVideos : [];
  if (data2.isAnonymous !== void 0) doc.is_anonymous = bool(data2.isAnonymous);
  if (data2.category !== void 0) {
    const cat = await categoryBySlug(String(data2.category));
    doc.category_id = cat?.document_id ?? null;
    doc.category_name = cat?.name ?? null;
    doc.category_slug = cat?.slug ?? null;
  }
  if (data2.cover !== void 0) {
    const resolved = await resolveCovers(data2.cover);
    doc.covers = resolved.covers;
    doc.cover_width = resolved.width ?? null;
    doc.cover_height = resolved.height ?? null;
  }
}
async function createDraft(req) {
  const viewer = await requireAuth(req);
  const data2 = await parseDraftBody(req);
  const documentId = genId();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const cat = await categoryBySlug(typeof data2.category === "string" ? data2.category : void 0);
  const covers = await resolveCovers(data2.cover);
  const doc = {
    id: documentId,
    document_id: documentId,
    title: String(data2.title || "\u65E0\u6807\u9898").slice(0, 200),
    text: String(data2.text || ""),
    body: "",
    covers: covers.covers,
    cover_width: covers.width ?? null,
    cover_height: covers.height ?? null,
    external_videos: Array.isArray(data2.externalVideos) ? data2.externalVideos : [],
    editor_state: Array.isArray(data2.editorState) ? data2.editorState : null,
    status: "draft",
    is_pinned: false,
    is_anonymous: bool(data2.isAnonymous),
    is_hidden: false,
    views: 0,
    likes_count: 0,
    comments_count: 0,
    favorites_count: 0,
    created_at: now,
    updated_at: now,
    published_at: null,
    category_id: cat?.document_id ?? null,
    category_name: cat?.name ?? null,
    category_slug: cat?.slug ?? null,
    ...await authorFields(viewer.userId)
  };
  await setJson(postKey(documentId), doc);
  await addDraft(viewer.userId, documentId);
  return ok(toDraft(doc));
}
async function updateDraft(req) {
  const viewer = await requireAuth(req);
  const id = decodeURIComponent(req.url.split("?")[0].split("/").filter(Boolean).pop() || "");
  const doc = await getPostDoc(id);
  if (!doc || doc.status !== "draft" || String(doc.author_document_id) !== viewer.userId) {
    return notFound("\u8349\u7A3F\u4E0D\u5B58\u5728");
  }
  const data2 = await parseDraftBody(req);
  await applyBodyToDoc(data2, doc);
  doc.updated_at = (/* @__PURE__ */ new Date()).toISOString();
  await setJson(postKey(id), doc);
  return ok(toDraft(doc));
}
function idBeforeAction(req) {
  const segments2 = req.url.split("?")[0].split("/").filter(Boolean);
  return decodeURIComponent(segments2[segments2.length - 2] || "");
}
async function publishDraft(req) {
  const viewer = await requireAuth(req);
  const id = idBeforeAction(req);
  const doc = await getPostDoc(id);
  if (!doc || doc.status !== "draft" || String(doc.author_document_id) !== viewer.userId) {
    return notFound("\u8349\u7A3F\u4E0D\u5B58\u5728");
  }
  const settings2 = await getJson(KEYS.settings) || {};
  const needAudit = settings2.needAudit === true;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const newStatus = needAudit ? "pending" : "published";
  const published = {
    ...doc,
    status: newStatus,
    published_at: needAudit ? null : now,
    updated_at: now,
    is_hidden: false
  };
  await setJson(postKey(id), published);
  await removeDraft(viewer.userId, id);
  if (!needAudit) {
    await feedAdd(published);
    await bumpStats({ postCount: 1 });
    await updateUserStats(String(doc.author_document_id), { articleCount: 1 });
  }
  return json({ success: true, status: newStatus });
}
async function discardDraft(req) {
  const viewer = await requireAuth(req);
  const id = idBeforeAction(req);
  const doc = await getPostDoc(id);
  if (!doc || doc.status !== "draft" || String(doc.author_document_id) !== viewer.userId) {
    return notFound("\u8349\u7A3F\u4E0D\u5B58\u5728");
  }
  await del(postKey(id));
  await removeDraft(viewer.userId, id);
  return json({ success: true });
}
async function remove(req) {
  const viewer = await requireAuth(req);
  const id = decodeURIComponent(req.url.split("?")[0].split("/").filter(Boolean).pop() || "");
  const doc = await getPostDoc(id);
  if (!doc) return notFound("\u5E16\u5B50\u4E0D\u5B58\u5728");
  const isOwner = String(doc.author_document_id) === viewer.userId;
  if (doc.status === "draft") {
    if (!isOwner) return badRequest("\u65E0\u6743\u5220\u9664");
    await del(postKey(id));
    await removeDraft(viewer.userId, id);
    return json({ success: true });
  }
  if (!isOwner && viewer.role !== "admin") return badRequest("\u65E0\u6743\u5220\u9664");
  const deleted = { ...doc, status: "deleted", is_hidden: true, updated_at: (/* @__PURE__ */ new Date()).toISOString() };
  await setJson(postKey(id), deleted);
  await feedRemove(id);
  await bumpStats({ postCount: -1 });
  await updateUserStats(String(doc.author_document_id), { articleCount: -1 });
  return json({ success: true });
}
async function myDrafts(req) {
  const viewer = await requireAuth(req);
  const qp = queryParams(req);
  const start = Math.max(0, int(qp.get("start")));
  const limit = Math.min(50, Math.max(1, int(qp.get("limit"), PAGE_SIZE)));
  const ids = await draftIds(viewer.userId);
  const docs = [];
  for (const id of ids) {
    const d = await getPostDoc(id);
    if (d && d.status === "draft") docs.push(d);
  }
  const page = docs.slice(start, start + limit);
  return paginated(page.map((d) => toDraft(d)), start, limit, docs.length);
}
async function myDraftDetail(req) {
  const viewer = await requireAuth(req);
  const id = decodeURIComponent(req.url.split("?")[0].split("/").filter(Boolean).pop() || "");
  const doc = await getPostDoc(id);
  if (!doc || doc.status !== "draft" || String(doc.author_document_id) !== viewer.userId) {
    return notFound("\u8349\u7A3F\u4E0D\u5B58\u5728");
  }
  return ok(toDraft(doc));
}
async function triple(req) {
  const viewer = await requireAuth(req);
  const { articleId } = await readJson(req);
  if (!articleId) return badRequest("\u7F3A\u5C11\u53C2\u6570");
  const doc = await getPostDoc(articleId);
  if (!doc) return notFound("\u5E16\u5B50\u4E0D\u5B58\u5728");
  let liked = await exists(likeKey(viewer.userId, "article", articleId));
  if (!liked) {
    await setJson(likeKey(viewer.userId, "article", articleId), { liked_at: (/* @__PURE__ */ new Date()).toISOString() });
    liked = true;
    await touchPost(articleId, { likes_count: Number(doc.likes_count || 0) + 1 });
  }
  let favorited = await exists(favoriteKey(viewer.userId, articleId));
  if (!favorited) {
    await setJson(favoriteKey(viewer.userId, articleId), { favorited_at: (/* @__PURE__ */ new Date()).toISOString() });
    favorited = true;
    await touchPost(articleId, { favorites_count: Number(doc.favorites_count || 0) + 1 });
  }
  const fresh = await getPostDoc(articleId);
  return json({
    liked,
    likesCount: Number(fresh?.likes_count || 0),
    favorited,
    favoritesCount: Number(fresh?.favorites_count || 0),
    coinGiven: true,
    coinReason: "OK",
    dennyCount: 0,
    newBalance: null
  });
}
async function bilibiliInfo() {
  return ok(null);
}
async function markReadBatch(req) {
  const viewer = await requireAuth(req);
  const { articleDocumentIds, markAsRead } = await readJson(req);
  const ids = Array.isArray(articleDocumentIds) ? articleDocumentIds.filter(Boolean) : [];
  const now = (/* @__PURE__ */ new Date()).toISOString();
  for (const id of ids) {
    if (markAsRead === true) await setJson(readKey(viewer.userId, id), { read_at: now });
    else await del(readKey(viewer.userId, id));
  }
  return json({ success: true });
}

// netlify/functions/_lib/routes/comments.ts
init_storage();
init_auth();
init_serialize();
async function getPostDoc2(id) {
  return getJson(postKey(id));
}
async function userCommentKeys(userId) {
  return await getJson(KEYS.userComments(userId)) ?? [];
}
async function addUserComment(userId, key) {
  const keys = await userCommentKeys(userId);
  if (!keys.includes(key)) {
    keys.unshift(key);
    await setJson(KEYS.userComments(userId), keys);
  }
}
async function removeUserComment(userId, key) {
  await setJson(KEYS.userComments(userId), (await userCommentKeys(userId)).filter((k) => k !== key));
}
async function buildCommentTree(postId, viewerId) {
  const keys = await listKeys(`comments/${postId}/`);
  const docs = [];
  for (const key of keys) {
    const d = await getJson(key);
    if (d) docs.push(d);
  }
  docs.sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
  const likedIds = /* @__PURE__ */ new Set();
  if (viewerId) {
    const likeKeys = await listKeys(`likes/${viewerId}/comment/`);
    const pageIds = new Set(docs.map((d) => String(d.document_id)));
    for (const k of likeKeys) {
      const cid = k.split("/")[3];
      if (pageIds.has(cid)) likedIds.add(cid);
    }
  }
  const byId = /* @__PURE__ */ new Map();
  const result = [];
  for (const d of docs) {
    const id = String(d.document_id);
    if (!d.parent_id) {
      const node = toComment(d, likedIds);
      if (node) {
        node.replies = [];
        byId.set(id, node);
        result.push(node);
      }
    }
  }
  for (const d of docs) {
    const id = String(d.document_id);
    if (d.parent_id) {
      const parent = byId.get(String(d.parent_id));
      const node = toComment(d, likedIds);
      if (parent && node) parent.replies.push(node);
    }
  }
  return result;
}
async function list2(req) {
  const qp = queryParams(req);
  const articleId = qp.get("article") || "";
  const start = Math.max(0, int(qp.get("start")));
  const limit = Math.min(50, Math.max(1, int(qp.get("limit"), 20)));
  const viewer = await resolveUser(req);
  if (!articleId) return ok([]);
  const post = await getPostDoc2(articleId);
  if (!post) return ok([]);
  const all = await buildCommentTree(articleId, viewer ? viewer.userId : null);
  all.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return 0;
  });
  const pinned = all.find((c) => c.isPinned === true) || null;
  const pageNodes = all.slice(start, start + limit);
  const meta = {
    pagination: { start, limit, total: all.length, pageCount: Math.ceil(all.length / limit) }
  };
  return json({ data: pageNodes, meta, pinned });
}
async function create(req) {
  const viewer = await requireAuth(req);
  const body = await readJson(req);
  const data2 = body.data || {};
  const postId = String(data2.article || "");
  const content = String(data2.content || "").trim();
  const parentId = data2.parent ? String(data2.parent) : void 0;
  const rawImages = Array.isArray(data2.images) ? data2.images.filter((u) => typeof u === "string" && u.length > 0) : [];
  const images = [];
  for (const id of rawImages) {
    if (id.startsWith("/") || id.startsWith("http")) {
      images.push(id);
      continue;
    }
    const meta = await getJson(`uploads/by-document/${id}.json`);
    if (meta?.url) images.push(String(meta.url));
  }
  if (!postId) return badRequest("\u7F3A\u5C11\u5E16\u5B50 ID");
  if (!content && images.length === 0) return badRequest("\u8BC4\u8BBA\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A");
  const post = await getPostDoc2(postId);
  if (!post) return notFound("\u5E16\u5B50\u4E0D\u5B58\u5728");
  if (parentId) {
    const parent = await getJson(KEYS.commentLookup(parentId));
    if (!parent) return notFound("\u56DE\u590D\u7684\u8BC4\u8BBA\u4E0D\u5B58\u5728");
  }
  const commentId = genId();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const keys = await listKeys(`comments/${postId}/`);
  const author = await getUser(viewer.userId);
  const doc = {
    id: commentId,
    document_id: commentId,
    post_id: postId,
    author_id: viewer.userId,
    parent_id: parentId || null,
    content,
    images,
    is_anonymous: bool(data2.isAnonymous),
    is_pinned: false,
    likes_count: 0,
    floor: keys.length + 1,
    created_at: now,
    author_document_id: viewer.userId,
    author_username: author?.username || "",
    author_name: author?.name || author?.username || "",
    author_avatar_url: author?.avatar_url || "/images/default-avatar.webp",
    author_level: author?.level ?? 1
  };
  const key = commentKey(postId, commentId);
  await setJson(key, doc);
  await setJson(KEYS.commentLookup(commentId), { post_id: postId, key });
  await addUserComment(viewer.userId, key);
  await feedUpdate(postId, { comments_count: Number(post.comments_count || 0) + 1 });
  await updateUserStats(String(post.author_document_id), { totalComments: 1 });
  await updateUserStats(viewer.userId, { commentCount: 1 });
  const node = toComment(doc, /* @__PURE__ */ new Set());
  node.replies = [];
  return ok(node);
}
async function findComment(commentId) {
  const lookup = await getJson(KEYS.commentLookup(commentId));
  if (!lookup) return null;
  const doc = await getJson(lookup.key);
  if (!doc) return null;
  return { doc, key: lookup.key, postId: lookup.post_id };
}
async function remove2(req) {
  const viewer = await requireAuth(req);
  const commentId = decodeURIComponent(req.url.split("?")[0].split("/").filter(Boolean).pop() || "");
  const found = await findComment(commentId);
  if (!found) return notFound("\u8BC4\u8BBA\u4E0D\u5B58\u5728");
  if (String(found.doc.author_document_id) !== viewer.userId && viewer.role !== "admin") {
    return badRequest("\u65E0\u6743\u5220\u9664");
  }
  await del(found.key);
  await del(KEYS.commentLookup(commentId));
  await removeUserComment(String(found.doc.author_document_id), found.key);
  const post = await getPostDoc2(found.postId);
  if (post) await feedUpdate(found.postId, { comments_count: Math.max(0, Number(post.comments_count || 0) - 1) });
  await updateUserStats(String(found.doc.author_document_id), { commentCount: -1 });
  await updateUserStats(String(post?.author_document_id), { totalComments: -1 });
  return json({ success: true });
}
async function pin(req) {
  const viewer = await requireAuth(req);
  const commentId = decodeURIComponent(req.url.split("?")[0].split("/").filter(Boolean).pop() || "");
  const found = await findComment(commentId);
  if (!found) return notFound("\u8BC4\u8BBA\u4E0D\u5B58\u5728");
  if (viewer.role !== "admin" && viewer.role !== "moderator") return badRequest("\u65E0\u6743\u7F6E\u9876");
  await setJson(found.key, { ...found.doc, is_pinned: true });
  return json({ success: true });
}
async function unpin(req) {
  const viewer = await requireAuth(req);
  const commentId = decodeURIComponent(req.url.split("?")[0].split("/").filter(Boolean).pop() || "");
  const found = await findComment(commentId);
  if (!found) return notFound("\u8BC4\u8BBA\u4E0D\u5B58\u5728");
  if (viewer.role !== "admin" && viewer.role !== "moderator") return badRequest("\u65E0\u6743\u53D6\u6D88\u7F6E\u9876");
  await setJson(found.key, { ...found.doc, is_pinned: false });
  return json({ success: true });
}

// netlify/functions/_lib/routes/interactions.ts
init_storage();
init_auth();
init_serialize();
async function touchArticleCount(postId, patch) {
  const doc = await getJson(postKey(postId));
  if (!doc) return;
  await setJson(postKey(postId), { ...doc, ...patch });
  await feedUpdate(postId, patch);
}
async function touchCommentCount(commentId, delta) {
  const lookup = await getJson(KEYS.commentLookup(commentId));
  if (!lookup) return;
  const doc = await getJson(lookup.key);
  if (!doc) return;
  await setJson(lookup.key, { ...doc, likes_count: Math.max(0, Number(doc.likes_count || 0) + delta) });
}
async function toggleLike(req) {
  const viewer = await requireAuth(req);
  const { targetType, targetId } = await readJson(req);
  if (!targetType || !targetId) return badRequest("\u7F3A\u5C11\u53C2\u6570");
  const key = likeKey(viewer.userId, targetType, targetId);
  const liked = await exists(key);
  if (liked) {
    await del(key);
    if (targetType === "article") {
      const doc = await getJson(postKey(targetId));
      await touchArticleCount(targetId, { likes_count: Math.max(0, Number(doc?.likes_count || 0) - 1) });
      const fresh = await getJson(postKey(targetId));
      return json({ liked: false, likesCount: Number(fresh?.likes_count || 0) });
    }
    await touchCommentCount(targetId, -1);
    return json({ liked: false, likesCount: 0 });
  }
  await setJson(key, { created_at: (/* @__PURE__ */ new Date()).toISOString() });
  if (targetType === "article") {
    const doc = await getJson(postKey(targetId));
    await touchArticleCount(targetId, { likes_count: Number(doc?.likes_count || 0) + 1 });
    const fresh = await getJson(postKey(targetId));
    return json({ liked: true, likesCount: Number(fresh?.likes_count || 0) });
  }
  await touchCommentCount(targetId, 1);
  return json({ liked: true, likesCount: 1 });
}
async function checkLikes(req) {
  const viewer = await requireAuth(req);
  const qp = queryParams(req);
  const targetType = qp.get("targetType") || "article";
  const ids = (qp.get("targetIds") || "").split(",").filter(Boolean);
  const flags = await Promise.all(ids.map((id) => exists(likeKey(viewer.userId, targetType, id))));
  const result = {};
  ids.forEach((id, i) => result[id] = flags[i]);
  return ok(result);
}
async function toggleFavorite(req) {
  const viewer = await requireAuth(req);
  const { targetId } = await readJson(req);
  if (!targetId) return badRequest("\u7F3A\u5C11\u53C2\u6570");
  const doc = await getJson(postKey(targetId));
  if (!doc) return notFound("\u5E16\u5B50\u4E0D\u5B58\u5728");
  const key = favoriteKey(viewer.userId, targetId);
  const favorited = await exists(key);
  if (favorited) {
    await del(key);
    await touchArticleCount(targetId, { favorites_count: Math.max(0, Number(doc.favorites_count || 0) - 1) });
  } else {
    await setJson(key, { created_at: (/* @__PURE__ */ new Date()).toISOString() });
    await touchArticleCount(targetId, { favorites_count: Number(doc.favorites_count || 0) + 1 });
  }
  const fresh = await getJson(postKey(targetId));
  return json({ favorited: !favorited, favoritesCount: Number(fresh?.favorites_count || 0) });
}
async function checkFavorites(req) {
  const viewer = await requireAuth(req);
  const ids = (queryParams(req).get("targetIds") || "").split(",").filter(Boolean);
  const flags = await Promise.all(ids.map((id) => exists(favoriteKey(viewer.userId, id))));
  const result = {};
  ids.forEach((id, i) => result[id] = flags[i]);
  return ok(result);
}
async function toggleFollow(req) {
  const viewer = await requireAuth(req);
  const { authorDocumentId } = await readJson(req);
  if (!authorDocumentId) return badRequest("\u7F3A\u5C11\u53C2\u6570");
  if (authorDocumentId === viewer.userId) return badRequest("\u4E0D\u80FD\u5173\u6CE8\u81EA\u5DF1");
  const target = await getUser(authorDocumentId);
  if (!target) return notFound("\u7528\u6237\u4E0D\u5B58\u5728");
  const key = followKey(viewer.userId, authorDocumentId);
  const following = await exists(key);
  if (following) {
    await del(key);
    await updateUserCounts(authorDocumentId, { followersCount: -1 });
    await updateUserCounts(viewer.userId, { followingCount: -1 });
  } else {
    await setJson(key, { created_at: (/* @__PURE__ */ new Date()).toISOString() });
    await updateUserCounts(authorDocumentId, { followersCount: 1 });
    await updateUserCounts(viewer.userId, { followingCount: 1 });
  }
  const fresh = await getUser(authorDocumentId);
  return json({ following: !following, followersCount: Number(fresh?.followersCount || 0) });
}
async function checkFollows(req) {
  const viewer = await requireAuth(req);
  const ids = (queryParams(req).get("authorIds") || "").split(",").filter(Boolean);
  const flags = await Promise.all(ids.map((id) => exists(followKey(viewer.userId, id))));
  const result = {};
  ids.forEach((id, i) => result[id] = flags[i]);
  return ok(result);
}
async function toggleUserBlock(req) {
  const viewer = await requireAuth(req);
  const { authorDocumentId } = await readJson(req);
  if (!authorDocumentId) return badRequest("\u7F3A\u5C11\u53C2\u6570");
  if (authorDocumentId === viewer.userId) return badRequest("\u4E0D\u80FD\u62C9\u9ED1\u81EA\u5DF1");
  if (!await getUser(authorDocumentId)) return notFound("\u7528\u6237\u4E0D\u5B58\u5728");
  const key = blockKey(viewer.userId, authorDocumentId);
  const blocked = await exists(key);
  if (blocked) await del(key);
  else await setJson(key, { created_at: (/* @__PURE__ */ new Date()).toISOString() });
  return json({ blocked: !blocked, authorDocumentId });
}
async function checkUserBlocks(req) {
  const viewer = await requireAuth(req);
  const ids = (queryParams(req).get("authorIds") || "").split(",").filter(Boolean);
  const flags = await Promise.all(ids.map((id) => exists(blockKey(viewer.userId, id))));
  const result = {};
  ids.forEach((id, i) => result[id] = flags[i]);
  return ok(result);
}
async function myBlockedList(req) {
  const viewer = await requireAuth(req);
  const qp = queryParams(req);
  const start = Math.max(0, int(qp.get("start")));
  const limit = Math.min(50, Math.max(1, int(qp.get("limit"), 20)));
  const keys = await listKeys(`user_blocks/${viewer.userId}/`);
  const blockedIds = keys.map((k) => k.split("/")[2]).filter(Boolean);
  const users2 = [];
  for (const id of blockedIds) {
    const u = await getUser(id);
    if (u) users2.push(u);
  }
  users2.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  const page = users2.slice(start, start + limit);
  return ok(
    page.map((u) => ({
      documentId: String(u.document_id),
      name: String(u.name || u.username || ""),
      username: String(u.username || ""),
      level: Number(u.level || 1),
      avatar: String(u.avatar_url || DEFAULT_AVATAR),
      createdAt: String(u.created_at || "")
    }))
  );
}
async function createReport(req) {
  const viewer = await requireAuth(req);
  const { targetType, targetId, reason, detail: detail3 } = await readJson(req);
  if (!targetType || !targetId || !reason) return badRequest("\u7F3A\u5C11\u53C2\u6570");
  const documentId = crypto.randomUUID();
  await setJson(reportKey(viewer.userId, targetType, targetId), {
    document_id: documentId,
    reporter_id: viewer.userId,
    target_type: targetType,
    target_id: targetId,
    reason,
    detail: detail3 || null,
    status: "open",
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  });
  return ok({ documentId });
}
async function checkReports(req) {
  const viewer = await requireAuth(req);
  const qp = queryParams(req);
  const targetType = qp.get("targetType") || "article";
  const ids = (qp.get("targetIds") || "").split(",").filter(Boolean);
  const flags = await Promise.all(ids.map((id) => exists(reportKey(viewer.userId, targetType, id))));
  const result = {};
  ids.forEach((id, i) => result[id] = flags[i]);
  return ok(result);
}
async function searchAuthors(req) {
  const qp = queryParams(req);
  const q = (qp.get("q") || "").trim().toLowerCase();
  const limit = Math.min(20, Math.max(1, int(qp.get("limit"), 8)));
  if (!q) return ok([]);
  const keys = await listKeys("users/");
  const result = [];
  for (const key of keys) {
    if (key.includes("/by-email/")) continue;
    const u = await getJson(key);
    if (!u) continue;
    const name = String(u.name || u.username || "");
    if (String(u.username || "").toLowerCase().includes(q) || name.toLowerCase().includes(q)) {
      result.push({
        documentId: String(u.document_id),
        name,
        username: String(u.username || ""),
        level: Number(u.level || 1),
        avatar: String(u.avatar_url || DEFAULT_AVATAR)
      });
    }
    if (result.length >= limit) break;
  }
  return ok(result);
}

// netlify/functions/_lib/routes/uploads.ts
init_storage();
init_auth();
init_serialize();
import sharp from "sharp";
var MAX_ORIGINAL_SIZE = 10 * 1024 * 1024;
var MAX_EDGE = 2048;
var WEBP_QUALITY = 80;
var UPLOAD_BY_DOC2 = (id) => `uploads/by-document/${id}.json`;
async function uploadsStore() {
  const { getStore: getStore2 } = await import("@netlify/blobs");
  return getStore2("uploads");
}
async function sign(req) {
  await requireAuth(req);
  const { mimeType, size, contentHash } = await readJson(req);
  const fileSize = Number(size || 0);
  if (!Number.isFinite(fileSize) || fileSize <= 0) return badRequest("\u7F3A\u5C11\u6587\u4EF6\u5927\u5C0F");
  if (fileSize > MAX_ORIGINAL_SIZE) return badRequest("\u56FE\u7247\u8FC7\u5927\uFF0C\u6700\u5927 10MB", "FILE_TOO_LARGE");
  const mime = String(mimeType || "image/jpeg");
  if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(mime)) {
    return badRequest("\u4EC5\u652F\u6301 jpeg/png/webp \u56FE\u7247", "UNSUPPORTED_TYPE");
  }
  const objectKey = contentHash && /^[a-f0-9]{64}$/i.test(contentHash) ? contentHash.toLowerCase() : genId();
  const existing = await getJson(uploadKey(objectKey));
  if (existing) {
    return ok({
      uploadUrl: "",
      uploadToken: objectKey,
      method: "PUT",
      objectKey,
      publicUrl: `/api/uploads/${objectKey}.webp`,
      headers: {},
      expiresAt: "",
      existing: toUploadedFile(existing)
    });
  }
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
    existing: void 0
  });
}
async function rawUpload(req) {
  const viewer = await requireAuth(req);
  const key = decodeURIComponent(req.url.split("/").filter(Boolean).pop() || "");
  if (!key) return badRequest("\u7F3A\u5C11\u5BF9\u8C61\u952E");
  const arrayBuffer = await req.arrayBuffer();
  if (!arrayBuffer || arrayBuffer.byteLength === 0) return badRequest("\u7A7A\u6587\u4EF6");
  if (arrayBuffer.byteLength > MAX_ORIGINAL_SIZE) return badRequest("\u56FE\u7247\u8FC7\u5927", "FILE_TOO_LARGE");
  let webp;
  let width;
  let height;
  try {
    const image = sharp(Buffer.from(arrayBuffer)).rotate().resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true }).webp({ quality: WEBP_QUALITY });
    webp = await image.toBuffer();
    const meta = await image.metadata();
    width = meta.width;
    height = meta.height;
  } catch {
    return badRequest("\u56FE\u7247\u89E3\u6790\u5931\u8D25", "INVALID_IMAGE");
  }
  const blobKey = `${key}.webp`;
  const store = await uploadsStore();
  await store.set(blobKey, new Blob([new Uint8Array(webp)], { type: "image/webp" }), {
    metadata: { contentType: "image/webp" }
  });
  const documentId = genId();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const doc = {
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
    created_at: now
  };
  await setJson(uploadKey(key), doc);
  await setJson(UPLOAD_BY_DOC2(documentId), { document_id: documentId, url: doc.url, width, height });
  return json({ ok: true });
}
async function complete(req) {
  const viewer = await requireAuth(req);
  const { uploadToken, width, height } = await readJson(req);
  if (!uploadToken) return badRequest("\u7F3A\u5C11 uploadToken");
  const doc = await getJson(uploadKey(uploadToken));
  if (!doc) return notFound("\u4E0A\u4F20\u8BB0\u5F55\u4E0D\u5B58\u5728");
  if (String(doc.owner_id) !== viewer.userId) return notFound("\u4E0A\u4F20\u8BB0\u5F55\u4E0D\u5B58\u5728");
  if (width != null && height != null) {
    const updated = { ...doc, width: Number(width), height: Number(height) };
    await setJson(uploadKey(uploadToken), updated);
    await setJson(UPLOAD_BY_DOC2(String(doc.document_id)), { document_id: doc.document_id, url: doc.url, width, height });
    return ok(toUploadedFile(updated));
  }
  return ok(toUploadedFile(doc));
}
async function serve(req) {
  const key = decodeURIComponent(req.url.split("?")[0].split("/").filter(Boolean).pop() || "");
  if (!key) return notFound();
  try {
    const store = await uploadsStore();
    const blob = await store.getWithMetadata(key, { type: "arrayBuffer" });
    if (!blob) return notFound("\u56FE\u7247\u4E0D\u5B58\u5728");
    return new Response(blob.data, {
      headers: {
        "content-type": String(blob.metadata?.contentType || "image/webp"),
        "cache-control": "public, max-age=31536000, immutable"
      }
    });
  } catch {
    return notFound("\u56FE\u7247\u4E0D\u5B58\u5728");
  }
}

// netlify/functions/_lib/routes/profiles.ts
init_storage();
init_auth();
init_serialize();
async function viewerState2(viewer, ids) {
  const state = { viewer, likedIds: /* @__PURE__ */ new Set(), favoritedIds: /* @__PURE__ */ new Set(), readIds: /* @__PURE__ */ new Set() };
  if (!viewer || ids.length === 0) return state;
  const [liked, favorited, read] = await Promise.all([
    Promise.all(ids.map((id) => exists(likeKey(viewer.userId, "article", id)))),
    Promise.all(ids.map((id) => exists(favoriteKey(viewer.userId, id)))),
    Promise.all(ids.map((id) => exists(readKey(viewer.userId, id))))
  ]);
  ids.forEach((id, i) => {
    if (liked[i]) state.likedIds.add(id);
    if (favorited[i]) state.favoritedIds.add(id);
    if (read[i]) state.readIds.add(id);
  });
  return state;
}
async function detail2(req) {
  const id = decodeURIComponent(req.url.split("?")[0].split("/").filter(Boolean).pop() || "");
  const viewer = await resolveUser(req);
  const user = await getJson(`users/${id}.json`);
  if (!user) return notFound("\u7528\u6237\u4E0D\u5B58\u5728");
  const isSelf = viewer != null && viewer.userId === id;
  const [isFollowing, isBlockedByMe, hasBlockedMe] = viewer ? await Promise.all([
    exists(`follows/${viewer.userId}/${id}.json`),
    exists(blockKey(viewer.userId, id)),
    exists(blockKey(id, viewer.userId))
  ]) : [false, false, false];
  const feed = await getFeed();
  const mine = feed.filter((p) => String(p.author_document_id) === id);
  return ok({
    documentId: id,
    userId: Number(user.uid || 0),
    uid: Number(user.uid || 0),
    login: String(user.username || ""),
    name: String(user.name || user.username || ""),
    bio: String(user.bio || ""),
    avatar: String(user.avatar_url || DEFAULT_AVATAR),
    level: Number(user.level || 1),
    exp: Number(user.exp || 0),
    isSelf,
    isHidden: false,
    profileHidden: user.profile_hidden === true,
    isAiAgent: false,
    isBlockedByMe,
    hasBlockedMe,
    isFollowing,
    followersCount: Number(user.followersCount || 0),
    followingCount: Number(user.followingCount || 0),
    stats: {
      articleCount: mine.length,
      commentCount: Number(user.stats?.commentCount || 0),
      totalViews: mine.reduce((s, p) => s + Number(p.views || 0), 0),
      totalComments: mine.reduce((s, p) => s + Number(p.comments_count || 0), 0),
      totalLikes: mine.reduce((s, p) => s + Number(p.likes_count || 0), 0)
    },
    equippedCard: null,
    equippedAvatar: null
  });
}
async function articles(req) {
  const segments2 = req.url.split("?")[0].split("/").filter(Boolean);
  const id = decodeURIComponent(segments2[segments2.length - 2] || "");
  const qp = queryParams(req);
  const start = Math.max(0, int(qp.get("start")));
  const limit = Math.min(50, Math.max(1, int(qp.get("limit"), 20)));
  const viewer = await resolveUser(req);
  const user = await getJson(`users/${id}.json`);
  if (!user) return notFound("\u7528\u6237\u4E0D\u5B58\u5728");
  let mine = (await getFeed()).filter((p) => String(p.author_document_id) === id);
  if (viewer) {
    const blocked = new Set((await listKeys(`user_blocks/${viewer.userId}/`)).map((k) => k.split("/")[2]));
    mine = mine.filter((p) => !blocked.has(String(p.author_document_id)));
  }
  const total = mine.length;
  const page = mine.slice(start, start + limit);
  const state = await viewerState2(viewer, page.map((p) => String(p.document_id)));
  return paginated(page.map((p) => toPost(p, state)).filter(Boolean), start, limit, total);
}
async function comments(req) {
  const segments2 = req.url.split("?")[0].split("/").filter(Boolean);
  const id = decodeURIComponent(segments2[segments2.length - 2] || "");
  const qp = queryParams(req);
  const start = Math.max(0, int(qp.get("start")));
  const limit = Math.min(50, Math.max(1, int(qp.get("limit"), 20)));
  const viewer = await resolveUser(req);
  const user = await getJson(`users/${id}.json`);
  if (!user) return notFound("\u7528\u6237\u4E0D\u5B58\u5728");
  const keys = await getJson(KEYS.userComments(id)) ?? [];
  const docs = [];
  for (const key of keys) {
    const d = await getJson(key);
    if (d) docs.push(d);
  }
  docs.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  const page = docs.slice(start, start + limit);
  const pageIds = new Set(page.map((d) => String(d.document_id)));
  const likedIds = /* @__PURE__ */ new Set();
  if (viewer) {
    const likeKeys = await listKeys(`likes/${viewer.userId}/comment/`);
    for (const k of likeKeys) {
      const cid = k.split("/")[3];
      if (pageIds.has(cid)) likedIds.add(cid);
    }
  }
  return paginated(page.map((d) => toComment(d, likedIds)).filter(Boolean), start, limit, docs.length);
}

// netlify/functions/_lib/routes/me.ts
init_storage();
init_auth();
init_serialize();
async function userDoc(userId) {
  const u = await getJson(userKey(userId));
  if (!u) throw { __api: true, status: 404, message: "\u7528\u6237\u4E0D\u5B58\u5728", code: "NOT_FOUND" };
  return u;
}
async function updateName(req) {
  const viewer = await requireAuth(req);
  const { name } = await readJson(req);
  const clean = String(name || "").trim().slice(0, 24);
  if (!clean) return badRequest("\u6635\u79F0\u4E0D\u80FD\u4E3A\u7A7A");
  const u = await userDoc(viewer.userId);
  await setJson(userKey(viewer.userId), { ...u, name: clean });
  return json({ name: clean });
}
async function updateBio(req) {
  const viewer = await requireAuth(req);
  const { bio } = await readJson(req);
  const clean = String(bio || "").trim().slice(0, 300);
  const u = await userDoc(viewer.userId);
  await setJson(userKey(viewer.userId), { ...u, bio: clean });
  return json({ bio: clean });
}
async function updateVisibility(req) {
  const viewer = await requireAuth(req);
  const { profileHidden } = await readJson(req);
  const u = await userDoc(viewer.userId);
  await setJson(userKey(viewer.userId), { ...u, profile_hidden: profileHidden === true });
  return json({ profileHidden: profileHidden === true });
}
async function security(req) {
  const viewer = await requireAuth(req);
  const u = await userDoc(viewer.userId);
  return json({
    email: u.email ? String(u.email) : "",
    provider: u.email ? "local" : "mihoyo",
    hasBoundEmail: Boolean(u.email),
    hasPassword: Boolean(u.password_hash)
  });
}
async function sendBindEmailCode(req) {
  const { email } = await readJson(req);
  const e = String(email || "").trim().toLowerCase();
  if (!e) return badRequest("\u8BF7\u8F93\u5165\u90AE\u7BB1");
  return json({ email: e, sent: true, expiresIn: 600, cooldown: 0 });
}
async function bindEmail(req) {
  const viewer = await requireAuth(req);
  const { email } = await readJson(req);
  const e = String(email || "").trim().toLowerCase();
  if (!e) return badRequest("\u8BF7\u8F93\u5165\u90AE\u7BB1");
  const u = await userDoc(viewer.userId);
  await setJson(userKey(viewer.userId), { ...u, email: e });
  await setJson(userEmailKey(e), { document_id: viewer.userId });
  return json({ email: e, provider: "local", hasBoundEmail: true, hasPassword: true });
}
async function uploads(req) {
  const viewer = await requireAuth(req);
  const u = new URL(req.url);
  const page = Math.max(1, int(u.searchParams.get("page"), 1));
  const pageSize = Math.min(60, Math.max(1, int(u.searchParams.get("pageSize"), 24)));
  const keys = (await listKeys("uploads/")).filter((k) => !k.includes("/by-document/"));
  const mine = [];
  for (const key of keys) {
    const d = await getJson(key);
    if (d && String(d.owner_id) === viewer.userId) mine.push(d);
  }
  mine.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  const total = mine.length;
  const offset = (page - 1) * pageSize;
  const slice = mine.slice(offset, offset + pageSize);
  return json({
    data: slice.map((d) => toUploadedFile(d)),
    meta: { pagination: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) } }
  });
}
async function deleteUpload(req) {
  const viewer = await requireAuth(req);
  const documentId = decodeURIComponent(req.url.split("?")[0].split("/").filter(Boolean).pop() || "");
  const keys = (await listKeys("uploads/")).filter((k) => !k.includes("/by-document/"));
  for (const key of keys) {
    const d = await getJson(key);
    if (d && String(d.document_id) === documentId && String(d.owner_id) === viewer.userId) {
      await del(key);
      await del(`uploads/by-document/${documentId}.json`);
      try {
        const { getStore: getStore2 } = await import("@netlify/blobs");
        const store = getStore2("uploads");
        const blobKey = String(d.url).split("/").pop();
        if (blobKey) await store.delete(blobKey);
      } catch {
      }
      return ok({ deleted: true, inUse: false });
    }
  }
  return ok({ deleted: false, inUse: false });
}
async function businessCards() {
  return json({ data: [], equippedCardDocumentId: null, equippedCard: null });
}
async function equipBusinessCard() {
  return json({ success: true });
}
async function avatars() {
  return json({ data: [], equippedAvatarDocumentId: null });
}
async function equipAvatar() {
  return json({ success: true });
}
async function uploadCustomAvatar(req) {
  const viewer = await requireAuth(req);
  const { fileId } = await readJson(req);
  if (!fileId) return badRequest("\u7F3A\u5C11\u6587\u4EF6");
  const documentId = String(fileId);
  const keys = (await listKeys("uploads/")).filter((k) => !k.includes("/by-document/"));
  let url = "";
  for (const key of keys) {
    const d = await getJson(key);
    if (d && String(d.document_id) === documentId && String(d.owner_id) === viewer.userId) {
      url = String(d.url || "");
      break;
    }
  }
  if (!url) return badRequest("\u6587\u4EF6\u4E0D\u5B58\u5728");
  const u = await userDoc(viewer.userId);
  await setJson(userKey(viewer.userId), { ...u, avatar_url: url });
  return json({ avatar: { url } });
}
async function pinnedArticles() {
  return json({ pinned: null, candidates: [], max: 6 });
}
async function updatePinnedArticles(req) {
  const { pinned } = await readJson(req);
  return json({ pinned: Array.isArray(pinned) ? pinned : null });
}
async function dailyExp() {
  return json({
    todaySelfGained: 0,
    todaySelfCap: 50,
    sources: {
      checkIn: { done: false, exp: 10 },
      createArticle: { done: false, exp: 20 },
      createComment: { done: false, exp: 10 },
      likeGive: { done: false, exp: 5 }
    }
  });
}

// netlify/functions/_lib/routes/admin.ts
init_storage();
init_auth();
init_serialize();
var PAGE_SIZE2 = 20;
async function buildTrend(feed, commentKeys) {
  const days = [];
  const postsByDay = /* @__PURE__ */ new Map();
  const commentsByDay = /* @__PURE__ */ new Map();
  const usersByDay = /* @__PURE__ */ new Map();
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1e3).toISOString().slice(0, 10);
    days.push(d);
    postsByDay.set(d, 0);
    commentsByDay.set(d, 0);
    usersByDay.set(d, 0);
  }
  for (const p of feed) {
    const d = String(p.created_at || "").slice(0, 10);
    if (postsByDay.has(d)) postsByDay.set(d, (postsByDay.get(d) || 0) + 1);
  }
  for (const key of commentKeys) {
    const c = await getJson(key);
    const d = String(c?.created_at || "").slice(0, 10);
    if (commentsByDay.has(d)) commentsByDay.set(d, (commentsByDay.get(d) || 0) + 1);
  }
  const userKeys = (await listKeys("users/")).filter(
    (k) => !k.includes("/by-email/") && !k.includes("/by-uid/")
  );
  for (const key of userKeys) {
    const u = await getJson(key);
    const d = String(u?.created_at || "").slice(0, 10);
    if (usersByDay.has(d)) usersByDay.set(d, (usersByDay.get(d) || 0) + 1);
  }
  return days.map((date) => ({
    date,
    posts: postsByDay.get(date) || 0,
    comments: commentsByDay.get(date) || 0,
    users: usersByDay.get(date) || 0
  }));
}
async function allPostDocs() {
  const keys = (await listKeys("posts/")).filter((k) => !k.includes("/_lookup/"));
  const docs = [];
  for (const key of keys) {
    const d = await getJson(key);
    if (d) docs.push(d);
  }
  docs.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  return docs;
}
function pageSlice(items, page, pageSize) {
  const start = (page - 1) * pageSize;
  return {
    data: items.slice(start, start + pageSize),
    total: items.length,
    pageCount: Math.ceil(items.length / pageSize)
  };
}
async function stats(req) {
  await requireAdmin(req);
  const s = await getStats();
  const keys = (await listKeys("users/")).filter(
    (k) => !k.includes("/by-email/") && !k.includes("/by-uid/") && !k.includes("/by-github/")
  );
  const recentUsers = [];
  for (const key of keys) {
    const u = await getJson(key);
    if (u) recentUsers.push(u);
  }
  recentUsers.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  const feed = await getFeed();
  const allPosts = await allPostDocs();
  const pendingPosts = allPosts.filter((p) => p.status === "pending").length;
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const todayPosts = feed.filter((p) => String(p.created_at || "").startsWith(today)).length;
  const commentKeys = (await listKeys("comments/")).filter((k) => !k.includes("/_lookup/"));
  let todayComments = 0;
  for (const key of commentKeys) {
    const c = await getJson(key);
    if (c && String(c.created_at || "").startsWith(today)) todayComments += 1;
  }
  const trend = await buildTrend(feed, commentKeys);
  return json({
    userCount: Number(s.userCount || 0),
    postCount: feed.length,
    // 以信息流为准（发布即入流），避免计数漂移成负数
    commentCount: Number(s.commentCount || 0),
    viewCount: Number(s.viewCount || 0),
    todayPosts,
    todayComments,
    pendingPosts,
    categoryCount: (await listKeys("categories/")).length,
    trend,
    recentUsers: recentUsers.slice(0, 5).map((u) => ({
      documentId: String(u.document_id),
      username: String(u.username || ""),
      name: String(u.name || u.username || ""),
      level: Number(u.level || 1),
      avatar: String(u.avatar_url || DEFAULT_AVATAR),
      createdAt: String(u.created_at || "")
    })),
    recentPosts: feed.slice(0, 5).map((p) => ({
      documentId: String(p.document_id),
      title: String(p.title || ""),
      views: Number(p.views || 0),
      likesCount: Number(p.likes_count || 0),
      commentsCount: Number(p.comments_count || 0),
      createdAt: String(p.created_at || "")
    }))
  });
}
async function users(req) {
  await requireAdmin(req);
  const qp = queryParams(req);
  const page = Math.max(1, int(qp.get("page"), 1));
  const pageSize = Math.min(50, Math.max(1, int(qp.get("pageSize"), PAGE_SIZE2)));
  const q = (qp.get("q") || "").toLowerCase();
  const keys = (await listKeys("users/")).filter(
    (k) => !k.includes("/by-email/") && !k.includes("/by-uid/")
  );
  const all = [];
  for (const key of keys) {
    const u = await getJson(key);
    if (u) all.push(u);
  }
  all.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  const filtered = q ? all.filter((u) => {
    const hay = `${u.username || ""} ${u.name || ""} ${u.email || ""} ${u.uid || ""}`.toLowerCase();
    return hay.includes(q);
  }) : all;
  const { data: data2, total, pageCount } = pageSlice(filtered, page, pageSize);
  return json({
    data: data2.map((u) => ({
      documentId: String(u.document_id),
      uid: Number(u.uid || 0),
      username: String(u.username || ""),
      name: String(u.name || u.username || ""),
      email: u.email ? String(u.email) : "",
      avatar: String(u.avatar_url || DEFAULT_AVATAR),
      level: Number(u.level || 1),
      exp: Number(u.exp || 0),
      role: String(u.role || "user"),
      status: String(u.status || "active"),
      createdAt: String(u.created_at || "")
    })),
    meta: { pagination: { page, pageSize, total, pageCount } }
  });
}
async function updateUser(req) {
  await requireAdmin(req);
  const id = decodeURIComponent(req.url.split("?")[0].split("/").filter(Boolean).pop() || "");
  const { role, status } = await readJson(req);
  const u = await getUser(id);
  if (!u) return notFound("\u7528\u6237\u4E0D\u5B58\u5728");
  if (role && !["user", "moderator", "admin"].includes(role)) return badRequest("\u89D2\u8272\u4E0D\u5408\u6CD5");
  if (status && !["active", "banned"].includes(status)) return badRequest("\u72B6\u6001\u4E0D\u5408\u6CD5");
  await setJson(`users/${id}.json`, {
    ...u,
    role: role ?? u.role,
    status: status ?? u.status
  });
  return json({ success: true });
}
async function posts(req) {
  await requireAdmin(req);
  const qp = queryParams(req);
  const page = Math.max(1, int(qp.get("page"), 1));
  const pageSize = Math.min(50, Math.max(1, int(qp.get("pageSize"), PAGE_SIZE2)));
  const q = (qp.get("q") || "").toLowerCase();
  const status = qp.get("status") || "";
  const all = await allPostDocs();
  const filtered = all.filter((p) => {
    if (status && p.status !== status) return false;
    if (q && !`${p.title || ""} ${p.text || ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const { data: data2, total, pageCount } = pageSlice(filtered, page, pageSize);
  return json({
    data: data2.map((p) => toPost(p)).filter(Boolean),
    meta: { pagination: { page, pageSize, total, pageCount } }
  });
}
async function updatePost(req) {
  await requireAdmin(req);
  const id = decodeURIComponent(req.url.split("?")[0].split("/").filter(Boolean).pop() || "");
  const body = await readJson(req);
  const doc = await getJson(`posts/${id}.json`);
  if (!doc) return notFound("\u5E16\u5B50\u4E0D\u5B58\u5728");
  if (body.status && !["published", "pending", "deleted", "draft"].includes(body.status)) return badRequest("\u72B6\u6001\u4E0D\u5408\u6CD5");
  const next = {
    ...doc,
    status: body.status ?? doc.status,
    is_pinned: body.isPinned ?? doc.is_pinned,
    is_hidden: body.isHidden ?? doc.is_hidden,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  await setJson(`posts/${id}.json`, next);
  const wasPublished = doc.status === "published" && doc.is_hidden !== true;
  const isPublished = next.status === "published" && next.is_hidden !== true;
  if (isPublished && !wasPublished) {
    await feedUpsert(next);
    await bumpStats({ postCount: 1 });
    await updateUserStats(String(doc.author_document_id), { articleCount: 1 });
  } else if (wasPublished && !isPublished) {
    await feedRemove(id);
    await bumpStats({ postCount: -1 });
    await updateUserStats(String(doc.author_document_id), { articleCount: -1 });
  } else if (isPublished) {
    await feedUpsert(next);
  }
  return json({ success: true });
}
async function comments2(req) {
  await requireAdmin(req);
  const qp = queryParams(req);
  const page = Math.max(1, int(qp.get("page"), 1));
  const pageSize = Math.min(50, Math.max(1, int(qp.get("pageSize"), PAGE_SIZE2)));
  const q = (qp.get("q") || "").toLowerCase();
  const keys = (await listKeys("comments/")).filter((k) => !k.includes("/_lookup/"));
  const all = [];
  for (const key of keys) {
    const d = await getJson(key);
    if (d) all.push(d);
  }
  all.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  const filtered = q ? all.filter((c) => String(c.content || "").toLowerCase().includes(q)) : all;
  const { data: data2, total, pageCount } = pageSlice(filtered, page, pageSize);
  return json({
    data: data2.map((c) => toComment(c)).filter(Boolean),
    meta: { pagination: { page, pageSize, total, pageCount } }
  });
}
async function deleteComment(req) {
  await requireAdmin(req);
  const id = decodeURIComponent(req.url.split("?")[0].split("/").filter(Boolean).pop() || "");
  const lookup = await getJson(KEYS.commentLookup(id));
  if (!lookup) return notFound("\u8BC4\u8BBA\u4E0D\u5B58\u5728");
  const doc = await getJson(lookup.key);
  if (!doc) return notFound("\u8BC4\u8BBA\u4E0D\u5B58\u5728");
  await del(lookup.key);
  await del(KEYS.commentLookup(id));
  await setJson(KEYS.userComments(String(doc.author_document_id || "")), []);
  const post = await getJson(`posts/${lookup.post_id}.json`);
  if (post) {
    const updated = { ...post, comments_count: Math.max(0, Number(post.comments_count || 0) - 1) };
    await setJson(`posts/${lookup.post_id}.json`, updated);
    await feedUpdate(lookup.post_id, { comments_count: updated.comments_count });
  }
  await updateUserStats(String(doc.author_document_id), { commentCount: -1 });
  await bumpStats({ commentCount: -1 });
  return json({ success: true });
}
async function categories(req) {
  await requireAdmin(req);
  const keys = await listKeys("categories/");
  const all = [];
  for (const key of keys) {
    const c = await getJson(key);
    if (c) all.push(c);
  }
  all.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  return json({ data: all.map((c) => toCategory(c)) });
}
async function createCategory(req) {
  await requireAdmin(req);
  const { name, slug, description, sortOrder } = await readJson(req);
  const cleanName = String(name || "").trim();
  const cleanSlug = String(slug || "").trim().toLowerCase().replace(/\s+/g, "-");
  if (!cleanName || !cleanSlug) return badRequest("\u540D\u79F0\u4E0E\u6807\u8BC6\u4E0D\u80FD\u4E3A\u7A7A");
  const id = genId();
  await setJson(categoryKey(id), {
    document_id: id,
    name: cleanName,
    slug: cleanSlug,
    description: String(description || ""),
    icon: "",
    sort_order: int(sortOrder),
    is_hidden: false,
    is_admin_only: false,
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  });
  return json({ success: true });
}
async function updateCategory(req) {
  await requireAdmin(req);
  const id = decodeURIComponent(req.url.split("?")[0].split("/").filter(Boolean).pop() || "");
  const { name, slug, description, sortOrder, isHidden } = await readJson(req);
  const c = await getJson(categoryKey(id));
  if (!c) return notFound("\u7248\u5757\u4E0D\u5B58\u5728");
  await setJson(categoryKey(id), {
    ...c,
    name: name ?? c.name,
    slug: slug ?? c.slug,
    description: description ?? c.description,
    sort_order: sortOrder != null ? int(sortOrder) : c.sort_order,
    is_hidden: isHidden ?? c.is_hidden
  });
  return json({ success: true });
}
async function deleteCategory(req) {
  await requireAdmin(req);
  const id = decodeURIComponent(req.url.split("?")[0].split("/").filter(Boolean).pop() || "");
  await del(categoryKey(id));
  return json({ success: true });
}
async function settings(req) {
  await requireAdmin(req);
  const s = await getJson(KEYS.settings) || {};
  return json({
    siteName: String(s.siteName || "\u7EF3\u7F51"),
    announcement: String(s.announcement || ""),
    allowRegister: s.allowRegister !== false,
    needAudit: s.needAudit === true,
    showSearch: s.showSearch !== false,
    showPresence: s.showPresence !== false,
    showKnock: s.showKnock !== false,
    showCreate: s.showCreate !== false,
    showAdmin: s.showAdmin !== false
  });
}
async function publicSettings() {
  const s = await getJson(KEYS.settings) || {};
  return json({
    siteName: String(s.siteName || "\u7EF3\u7F51"),
    announcement: String(s.announcement || ""),
    showSearch: s.showSearch !== false,
    showPresence: s.showPresence !== false,
    showKnock: s.showKnock !== false,
    showCreate: s.showCreate !== false,
    showAdmin: s.showAdmin !== false
  });
}
async function updateSettings(req) {
  await requireAdmin(req);
  const body = await readJson(req);
  const s = await getJson(KEYS.settings) || {};
  await setJson(KEYS.settings, {
    ...s,
    siteName: body.siteName ?? s.siteName,
    announcement: body.announcement ?? s.announcement,
    allowRegister: body.allowRegister ?? s.allowRegister,
    needAudit: body.needAudit ?? s.needAudit,
    showSearch: body.showSearch ?? s.showSearch,
    showPresence: body.showPresence ?? s.showPresence,
    showKnock: body.showKnock ?? s.showKnock,
    showCreate: body.showCreate ?? s.showCreate,
    showAdmin: body.showAdmin ?? s.showAdmin
  });
  return json({ success: true });
}
async function allReports() {
  const keys = (await listKeys("reports/")).filter((k) => !k.includes("/_by-id/"));
  const docs = [];
  for (const key of keys) {
    const r = await getJson(key);
    if (r) docs.push(r);
  }
  docs.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  return docs;
}
async function reports(req) {
  await requireAdmin(req);
  const qp = queryParams(req);
  const page = Math.max(1, int(qp.get("page"), 1));
  const pageSize = Math.min(50, Math.max(1, int(qp.get("pageSize"), PAGE_SIZE2)));
  const status = qp.get("status") || "";
  const all = await allReports();
  const filtered = status ? all.filter((r) => r.status === status) : all;
  const { data: data2, total, pageCount } = pageSlice(filtered, page, pageSize);
  const enriched = [];
  for (const r of data2) {
    const reporter = await getUser(String(r.reporter_id || ""));
    let target = null;
    const targetId = String(r.target_id || "");
    const targetType = String(r.target_type || "");
    if (targetType === "post") {
      const p = await getJson(`posts/${targetId}.json`);
      if (p) target = { type: "post", title: p.title, documentId: p.document_id, status: p.status };
    } else if (targetType === "comment") {
      const lookup = await getJson(KEYS.commentLookup(targetId));
      if (lookup) {
        const c = await getJson(lookup.key);
        if (c) target = { type: "comment", content: String(c.content || "").slice(0, 60), documentId: c.document_id };
      }
    } else if (targetType === "user") {
      const u = await getUser(targetId);
      if (u) target = { type: "user", name: u.name || u.username, documentId: u.document_id };
    }
    enriched.push({
      documentId: String(r.document_id),
      targetType,
      targetId,
      reason: r.reason,
      detail: r.detail || void 0,
      status: r.status,
      createdAt: String(r.created_at || ""),
      reporter: reporter ? { documentId: reporter.document_id, name: reporter.name || reporter.username } : null,
      target
    });
  }
  return json({
    data: enriched,
    meta: { pagination: { page, pageSize, total, pageCount } }
  });
}
async function processReport(req) {
  await requireAdmin(req);
  const id = decodeURIComponent(req.url.split("?")[0].split("/").filter(Boolean).pop() || "");
  const { action } = await readJson(req);
  if (action !== "delete" && action !== "dismiss") return badRequest("action \u4EC5\u652F\u6301 delete / dismiss");
  const all = await allReports();
  const report = all.find((r) => r.document_id === id);
  if (!report) return notFound("\u4E3E\u62A5\u4E0D\u5B58\u5728");
  const targetType = String(report.target_type || "");
  const targetId = String(report.target_id || "");
  if (action === "delete") {
    if (targetType === "post") {
      const p = await getJson(`posts/${targetId}.json`);
      if (p && p.status !== "deleted") {
        await setJson(`posts/${targetId}.json`, { ...p, status: "deleted", is_hidden: true, updated_at: (/* @__PURE__ */ new Date()).toISOString() });
        await feedRemove(targetId);
        if (p.status === "published") {
          await bumpStats({ postCount: -1 });
          await updateUserStats(String(p.author_document_id), { articleCount: -1 });
        }
      }
    } else if (targetType === "comment") {
      const lookup = await getJson(KEYS.commentLookup(targetId));
      if (lookup) {
        const c = await getJson(lookup.key);
        if (c) {
          await del(lookup.key);
          await del(KEYS.commentLookup(targetId));
          await setJson(KEYS.userComments(String(c.author_document_id || "")), []);
          const post = await getJson(`posts/${lookup.post_id}.json`);
          if (post) {
            const updated = { ...post, comments_count: Math.max(0, Number(post.comments_count || 0) - 1) };
            await setJson(`posts/${lookup.post_id}.json`, updated);
            await feedUpdate(lookup.post_id, { comments_count: updated.comments_count });
          }
          await updateUserStats(String(c.author_document_id), { commentCount: -1 });
          await bumpStats({ commentCount: -1 });
        }
      }
    } else if (targetType === "user") {
      const u = await getUser(targetId);
      if (u) await setJson(`users/${targetId}.json`, { ...u, status: "banned" });
    }
  }
  const newStatus = action === "delete" ? "resolved" : "dismissed";
  const keys = (await listKeys("reports/")).filter((k) => !k.includes("/_by-id/"));
  for (const key of keys) {
    const r = await getJson(key);
    if (r && r.document_id === id) {
      await setJson(key, { ...r, status: newStatus, processed_at: (/* @__PURE__ */ new Date()).toISOString() });
      break;
    }
  }
  return json({ success: true });
}

// netlify/functions/_lib/routes/emotes.ts
init_storage();
init_auth();
import sharp2 from "sharp";
var MAX_EDGE2 = 128;
var WEBP_QUALITY2 = 85;
var DEFAULT_GROUP = "\u901A\u7528";
var CODE_RE = /^ik-[a-z0-9-]{1,32}$/;
async function uploadsStore2() {
  const { getStore: getStore2 } = await import("@netlify/blobs");
  return getStore2("uploads");
}
async function readManifest() {
  const doc = await getJson(KEYS.emotes) || null;
  if (doc && Array.isArray(doc.emotes) && Array.isArray(doc.groups)) return doc;
  return { groups: [{ name: DEFAULT_GROUP, order: 1, iconUrl: null }], emotes: [] };
}
async function saveManifest(doc) {
  await setJson(KEYS.emotes, doc);
}
async function manifest() {
  return json(await readManifest());
}
async function adminList(req) {
  await requireAdmin(req);
  return json(await readManifest());
}
async function createEmote(req) {
  await requireAdmin(req);
  const body = await readJson(req);
  const code = String(body.code || "").trim().toLowerCase();
  const name = String(body.name || "").trim();
  const group = String(body.group || "").trim() || DEFAULT_GROUP;
  const dataUrl = String(body.dataUrl || "");
  if (!CODE_RE.test(code)) return badRequest("\u8868\u60C5\u4EE3\u7801\u9700\u4E3A ik- \u5F00\u5934\u7684\u5C0F\u5199\u5B57\u6BCD\u6570\u5B57\uFF0C\u5982 ik-smile");
  if (!name) return badRequest("\u8BF7\u586B\u5199\u8868\u60C5\u540D\u79F0");
  if (!dataUrl) return badRequest("\u7F3A\u5C11\u56FE\u7247");
  const doc = await readManifest();
  if (doc.emotes.some((e) => e.code === code)) return badRequest(`\u5DF2\u5B58\u5728\u4EE3\u7801\u300C${code}\u300D`);
  const base64 = dataUrl.includes("base64,") ? dataUrl.split("base64,")[1] : dataUrl;
  let buffer;
  try {
    buffer = Buffer.from(base64, "base64");
  } catch {
    return badRequest("\u56FE\u7247\u6570\u636E\u65E0\u6548");
  }
  if (!buffer.length) return badRequest("\u56FE\u7247\u6570\u636E\u4E3A\u7A7A");
  let webp;
  let width = null;
  let height = null;
  try {
    const image = sharp2(buffer).rotate().resize({ width: MAX_EDGE2, height: MAX_EDGE2, fit: "inside", withoutEnlargement: true }).webp({ quality: WEBP_QUALITY2 });
    webp = await image.toBuffer();
    const meta = await image.metadata();
    width = meta.width ?? null;
    height = meta.height ?? null;
  } catch {
    return badRequest("\u56FE\u7247\u89E3\u6790\u5931\u8D25\uFF0C\u8BF7\u4E0A\u4F20\u6709\u6548\u56FE\u7247", "INVALID_IMAGE");
  }
  const id = genId();
  const blobKey = `emotes/${id}.webp`;
  const store = await uploadsStore2();
  await store.set(blobKey, new Blob([new Uint8Array(webp)], { type: "image/webp" }), {
    metadata: { contentType: "image/webp" }
  });
  const emote = {
    id,
    code,
    name,
    group,
    url: `/api/uploads/${blobKey}`,
    width,
    height
  };
  if (!doc.groups.some((g) => g.name === group)) {
    doc.groups.push({ name: group, order: doc.groups.length + 1, iconUrl: null });
  }
  doc.emotes.push(emote);
  await saveManifest(doc);
  return json({ success: true, emote });
}
async function deleteEmote(req) {
  await requireAdmin(req);
  const code = decodeURIComponent(req.url.split("?")[0].split("/").filter(Boolean).pop() || "");
  const doc = await readManifest();
  const idx = doc.emotes.findIndex((e) => e.code === code);
  if (idx === -1) return notFound("\u8868\u60C5\u4E0D\u5B58\u5728");
  const [removed] = doc.emotes.splice(idx, 1);
  if (removed?.url) {
    try {
      const key = removed.url.split("/").pop() || "";
      const store = await uploadsStore2();
      await store.delete(key);
    } catch {
    }
  }
  await saveManifest(doc);
  return json({ success: true });
}
async function addGroup(req) {
  await requireAdmin(req);
  const body = await readJson(req);
  const name = String(body.name || "").trim();
  if (!name) return badRequest("\u8BF7\u586B\u5199\u5206\u7EC4\u540D\u79F0");
  const doc = await readManifest();
  if (doc.groups.some((g) => g.name === name)) return badRequest("\u5206\u7EC4\u5DF2\u5B58\u5728");
  doc.groups.push({ name, order: body.order != null ? Number(body.order) : doc.groups.length + 1, iconUrl: null });
  await saveManifest(doc);
  return json({ success: true });
}
async function deleteGroup(req) {
  await requireAdmin(req);
  const name = decodeURIComponent(req.url.split("?")[0].split("/").filter(Boolean).pop() || "");
  const doc = await readManifest();
  const idx = doc.groups.findIndex((g) => g.name === name);
  if (idx === -1) return notFound("\u5206\u7EC4\u4E0D\u5B58\u5728");
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

// netlify/functions/_lib/routes/github.ts
init_storage();
init_auth();
init_serialize();
var GITHUB_BY_ID = (id) => `users/by-github/${id}.json`;
var CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
var CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";
async function callback(req) {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return error(
      501,
      "GitHub \u767B\u5F55\u672A\u914D\u7F6E\uFF1A\u8BF7\u5728\u73AF\u5883\u53D8\u91CF\u4E2D\u8BBE\u7F6E GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET",
      "GITHUB_NOT_CONFIGURED"
    );
  }
  const { code, redirectUri } = await readJson(req);
  if (!code) return badRequest("\u7F3A\u5C11\u6388\u6743\u7801");
  const redirectUriValue = redirectUri || process.env.GITHUB_REDIRECT_URI || "";
  let tokenData;
  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: redirectUriValue
      })
    });
    tokenData = await tokenRes.json();
  } catch {
    return error(502, "GitHub \u6388\u6743\u670D\u52A1\u6682\u4E0D\u53EF\u7528", "GITHUB_NETWORK_ERROR");
  }
  if (!tokenData.access_token) {
    return error(401, `GitHub \u6388\u6743\u5931\u8D25\uFF1A${tokenData.error_description || tokenData.error || "\u672A\u77E5\u9519\u8BEF"}`, "GITHUB_AUTH_FAILED");
  }
  let gh;
  try {
    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/json",
        "User-Agent": "inter-knot"
      }
    });
    if (!userRes.ok) return error(502, "\u83B7\u53D6 GitHub \u7528\u6237\u4FE1\u606F\u5931\u8D25", "GITHUB_USER_FETCH_FAILED");
    gh = await userRes.json();
  } catch {
    return error(502, "\u83B7\u53D6 GitHub \u7528\u6237\u4FE1\u606F\u5931\u8D25", "GITHUB_USER_FETCH_FAILED");
  }
  if (!gh || !gh.id) return error(502, "GitHub \u8FD4\u56DE\u6570\u636E\u5F02\u5E38", "GITHUB_USER_FETCH_FAILED");
  const idx = await getJson(GITHUB_BY_ID(gh.id));
  let user;
  if (idx) {
    const existing = await getJson(userKey(idx.document_id));
    if (!existing) return error(500, "\u7528\u6237\u6570\u636E\u5F02\u5E38", "USER_NOT_FOUND");
    user = existing;
  } else {
    const documentId = genId();
    const uid = await generateUid();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const username = String(gh.login || `gh${gh.id}`).slice(0, 24);
    const email = typeof gh.email === "string" && gh.email ? gh.email.toLowerCase() : null;
    let emailIndexed = false;
    if (email) {
      const taken = await getJson(userEmailKey(email));
      if (!taken) {
        await setJson(userEmailKey(email), { document_id: documentId });
        emailIndexed = true;
      }
    }
    user = {
      document_id: documentId,
      uid,
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
      followingCount: 0
    };
    await setJson(userKey(documentId), user);
    await setJson(GITHUB_BY_ID(gh.id), { document_id: documentId });
    await setJson(userUidKey(uid), { document_id: documentId });
    await bumpStats({ userCount: 1 });
  }
  if (user.status !== "active") return error(403, "\u8D26\u53F7\u5DF2\u88AB\u7981\u7528", "USER_BLOCKED");
  const jwt = await signToken({
    documentId: String(user.document_id),
    username: String(user.username),
    role: String(user.role || "user")
  });
  return json({ jwt, user: toAuthor(user) });
}

// netlify/functions/_lib/routes/stubs.ts
function mihoyoQrCreate() {
  return error(
    501,
    "\u7C73\u6E38\u793E\u767B\u5F55\u6682\u672A\u5F00\u653E\uFF0C\u8BF7\u4F7F\u7528\u90AE\u7BB1\u6CE8\u518C\u6216\u767B\u5F55",
    "MIHOYO_NOT_SUPPORTED"
  );
}
function mihoyoQrStatus() {
  return json({ status: "expired" });
}
function mihoyoBinding() {
  return json({ binding: null });
}
function mihoyoUnbind() {
  return json({ success: true });
}
function checkInStatus() {
  return json({ canCheckIn: false, totalDays: 0, consecutiveDays: 0, rank: 0, nextEligibleAt: null });
}
function checkIn() {
  return json({
    message: "\u7B7E\u5230\u529F\u80FD\u6682\u672A\u5F00\u653E",
    reward: 0,
    dennyAdded: 0,
    currentDenny: 0,
    consecutiveDays: 0,
    totalDays: 0,
    rank: 0
  });
}
function benefitsMe() {
  return json({
    level: 1,
    maxLevel: 60,
    benefits: { articleMaxImages: 9, commentMaxImages: 9, articleMaxBody: 1e5 },
    nextLevel: void 0
  });
}
var EXAM_CONFIG = {
  questionCount: 10,
  passScorePercent: 60,
  timeLimitSeconds: 600,
  maxFailsBeforeCooldown: 3,
  failCooldownSeconds: 3600,
  rewardDenny: 0,
  rewardExp: 0
};
function examStatus() {
  return json({ passed: true, passedAt: (/* @__PURE__ */ new Date()).toISOString(), config: EXAM_CONFIG });
}
function examStart() {
  return json({ attemptId: "", resumed: false, startedAt: "", expiresAt: "", questions: [], config: EXAM_CONFIG });
}
function examSubmit() {
  return json({
    passed: true,
    score: 100,
    totalScore: 100,
    scorePercent: 100,
    correctCount: 10,
    questionCount: 10,
    passScorePercent: 60,
    cooldownRemaining: 0,
    reward: null
  });
}
function examReview() {
  return json({
    attemptId: "",
    passed: true,
    score: 100,
    totalScore: 100,
    scorePercent: 100,
    correctCount: 10,
    questionCount: 10,
    submittedAt: (/* @__PURE__ */ new Date()).toISOString(),
    config: EXAM_CONFIG,
    questions: []
  });
}
function dmConversations() {
  return ok([]);
}
function dmDirect() {
  return json({ data: null, isNew: false });
}
function dmAiSession() {
  return json({ data: null, isNew: false });
}
function dmReadAll() {
  return json({ success: true });
}
function dmAiAction() {
  return json({ success: true });
}
function dmSocketTicket() {
  return json({ ticket: "" });
}
function knockConversations() {
  return ok([]);
}
function knockStream() {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(": connected\n\n"));
      controller.close();
    }
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    }
  });
}
async function presencePing(req) {
  const { getJson: getJson2, setJson: setJson2, del: del2, listKeys: listKeys2 } = await Promise.resolve().then(() => (init_storage(), storage_exports));
  const { resolveUser: resolveUser2 } = await Promise.resolve().then(() => (init_auth(), auth_exports));
  const { DEFAULT_AVATAR: DEFAULT_AVATAR2 } = await Promise.resolve().then(() => (init_serialize(), serialize_exports));
  const body = await readJson(req);
  const presenceId = body.presenceId || "";
  const viewer = await resolveUser2(req);
  const now = Date.now();
  const STALE_MS = 45e3;
  const prefix = "presence/sessions/";
  const keys = await listKeys2(prefix);
  const sessions = [];
  for (const key of keys) {
    const s = await getJson2(key);
    if (!s) continue;
    const last = new Date(String(s.lastSeenAt || "")).getTime();
    if (!Number.isFinite(last) || now - last > STALE_MS) {
      await del2(key);
      continue;
    }
    sessions.push(s);
  }
  if (presenceId) {
    const key = `${prefix}${presenceId}.json`;
    const existing = await getJson2(key);
    let info = {};
    if (viewer) {
      const u = await getJson2(`users/${viewer.userId}.json`);
      info = {
        userId: viewer.userId,
        username: viewer.username,
        name: u?.name || viewer.username,
        level: u?.level ?? 1,
        avatar: u?.avatar_url || DEFAULT_AVATAR2
      };
    }
    const session = {
      presenceId,
      ...info,
      joinedAt: existing?.joinedAt || new Date(now).toISOString(),
      lastSeenAt: new Date(now).toISOString()
    };
    await setJson2(key, session);
    sessions.push(session);
  }
  const onlineUsers = sessions.filter((s) => !!s.username).map((s) => ({
    username: String(s.username),
    name: String(s.name || s.username),
    level: Number(s.level ?? 1),
    avatar: String(s.avatar || DEFAULT_AVATAR2),
    joinedAt: String(s.joinedAt || ""),
    durationSeconds: Math.max(
      0,
      Math.floor((now - new Date(String(s.joinedAt || "")).getTime()) / 1e3)
    )
  })).sort((a, b) => b.durationSeconds - a.durationSeconds);
  return json({
    data: {
      online: sessions.length,
      avatars: sessions.map((s) => String(s.avatar || DEFAULT_AVATAR2)).slice(0, 5),
      users: onlineUsers
    }
  });
}
function agentCharacters() {
  return ok([]);
}

// netlify/functions/api.ts
async function handler(req) {
  try {
    await ensureSeed();
  } catch (err) {
    console.error("seed failed:", err);
  }
  try {
    return await dispatch(req);
  } catch (err) {
    if (isApiThrow(err)) return error(err.status, err.message, err.code);
    console.error("API error:", err);
    return error(500, "\u670D\u52A1\u5668\u5F02\u5E38", "INTERNAL");
  }
}
var config = {
  path: "/api/*"
};
function segments(req) {
  return new URL(req.url).pathname.split("/").filter(Boolean);
}
function method(req) {
  return req.method.toUpperCase();
}
function isGet(req) {
  return method(req) === "GET";
}
function isPost(req) {
  return method(req) === "POST";
}
function isPut(req) {
  return method(req) === "PUT";
}
function isPatch(req) {
  return method(req) === "PATCH";
}
function isDelete(req) {
  return method(req) === "DELETE";
}
async function dispatch(req) {
  const s = segments(req);
  const area = s[1] || "";
  const sub = s[2] || "";
  const sub2 = s[3] || "";
  switch (area) {
    // ── 认证 ─────────────────────────────────────────
    case "auth": {
      if (sub === "local" && isPost(req)) return login(req);
      if (sub === "renew" && isPost(req)) return renew(req);
      if (sub === "send-register-code" && isPost(req)) return sendRegisterCode(req);
      if (sub === "register-with-code" && isPost(req)) return registerWithCode(req);
      if (sub === "send-reset-code" && isPost(req)) return sendResetCode(req);
      if (sub === "reset-password" && isPost(req)) return resetPassword(req);
      if (sub === "mihoyo" && sub2 === "qr" && s.length === 4 && isPost(req)) return mihoyoQrCreate();
      if (sub === "mihoyo" && sub2 === "qr" && s[4] === "status" && isPost(req)) return mihoyoQrStatus();
      if (sub === "mihoyo" && sub2 === "binding" && isGet(req)) return mihoyoBinding();
      if (sub === "mihoyo" && sub2 === "binding" && isDelete(req)) return mihoyoUnbind();
      return error(404, "\u63A5\u53E3\u4E0D\u5B58\u5728");
    }
    // ── 帖子 / 帖子 ─────────────────────────────────
    case "articles": {
      if (sub === "list" && isGet(req)) return list(req);
      if (sub === "search" && isGet(req)) return list(req);
      if (sub === "suggest" && isGet(req)) return suggest(req);
      if (sub === "triple" && isPost(req)) return triple(req);
      if (sub === "bilibili-info" && isGet(req)) return bilibiliInfo();
      if (sub === "my" && sub2 === "drafts" && isGet(req)) return myDrafts(req);
      if (sub === "my" && sub2 === "detail" && isGet(req)) return myDraftDetail(req);
      if (sub === "detail" && isGet(req)) return detail(req);
      if (s.length >= 4 && sub2 === "view" && isPost(req)) return view(req);
      if (s.length >= 4 && sub2 === "publish" && isPost(req)) return publishDraft(req);
      if (s.length >= 4 && sub2 === "discard-draft" && isPost(req)) return discardDraft(req);
      if (s.length === 2 && isPost(req)) return createDraft(req);
      if (s.length === 3 && isPut(req)) return updateDraft(req);
      if (s.length === 3 && isDelete(req)) return remove(req);
      return error(404, "\u63A5\u53E3\u4E0D\u5B58\u5728");
    }
    // ── 评论 ─────────────────────────────────────────
    case "comments": {
      if (sub === "list" && isGet(req)) return list2(req);
      if (s.length === 2 && isPost(req)) return create(req);
      if (s.length === 3 && isDelete(req)) return remove2(req);
      if (sub2 === "pin" && isPost(req)) return pin(req);
      if (sub2 === "unpin" && isPost(req)) return unpin(req);
      return error(404, "\u63A5\u53E3\u4E0D\u5B58\u5728");
    }
    // ── 版块 ─────────────────────────────────────────
    case "categories": {
      if (sub === "list" && isGet(req)) {
        const { listKeys: listKeys2, getJson: getJson2, categoryKey: categoryKey3 } = await Promise.resolve().then(() => (init_storage(), storage_exports));
        const { toCategory: toCategory2 } = await Promise.resolve().then(() => (init_serialize(), serialize_exports));
        const keys = (await listKeys2("categories/")).filter((k) => !k.includes("/_lookup/"));
        const rows = [];
        for (const key of keys) {
          const c = await getJson2(key);
          if (c && c.is_hidden !== true) rows.push(toCategory2(c));
        }
        rows.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
        return json({ data: rows });
      }
      return error(404, "\u63A5\u53E3\u4E0D\u5B58\u5728");
    }
    // ── 互动 ─────────────────────────────────────────
    case "likes": {
      if (sub === "toggle" && isPost(req)) return toggleLike(req);
      if (sub === "check" && isGet(req)) return checkLikes(req);
      return error(404, "\u63A5\u53E3\u4E0D\u5B58\u5728");
    }
    case "favorites": {
      if (sub === "toggle" && isPost(req)) return toggleFavorite(req);
      if (sub === "check" && isGet(req)) return checkFavorites(req);
      return error(404, "\u63A5\u53E3\u4E0D\u5B58\u5728");
    }
    case "follows": {
      if (sub === "toggle" && isPost(req)) return toggleFollow(req);
      if (sub === "check" && isGet(req)) return checkFollows(req);
      return error(404, "\u63A5\u53E3\u4E0D\u5B58\u5728");
    }
    case "user-blocks": {
      if (sub === "toggle" && isPost(req)) return toggleUserBlock(req);
      if (sub === "check" && isGet(req)) return checkUserBlocks(req);
      if (sub === "my-list" && isGet(req)) return myBlockedList(req);
      return error(404, "\u63A5\u53E3\u4E0D\u5B58\u5728");
    }
    case "reports": {
      if (s.length === 2 && isPost(req)) return createReport(req);
      if (sub === "check" && isGet(req)) return checkReports(req);
      return error(404, "\u63A5\u53E3\u4E0D\u5B58\u5728");
    }
    case "authors": {
      if (sub === "search" && isGet(req)) return searchAuthors(req);
      return error(404, "\u63A5\u53E3\u4E0D\u5B58\u5728");
    }
    case "article-reads": {
      if (sub === "batch" && isPost(req)) return markReadBatch(req);
      return error(404, "\u63A5\u53E3\u4E0D\u5B58\u5728");
    }
    // ── GitHub OAuth 登录 ────────────────────────────
    case "github": {
      if (sub === "callback" && isPost(req)) return callback(req);
      return error(404, "\u63A5\u53E3\u4E0D\u5B58\u5728");
    }
    // ── 个人主页 ─────────────────────────────────────
    case "profiles": {
      if (sub2 === "articles" && isGet(req)) return articles(req);
      if (sub2 === "comments" && isGet(req)) return comments(req);
      if (s.length === 3 && isGet(req)) return detail2(req);
      return error(404, "\u63A5\u53E3\u4E0D\u5B58\u5728");
    }
    // ── 我的 ─────────────────────────────────────────
    case "me": {
      if (sub === "profile" && s.length === 3 && isGet(req)) return meProfile(req);
      if (sub === "profile" && sub2 === "name" && isPut(req)) return updateName(req);
      if (sub === "profile" && sub2 === "bio" && isPut(req)) return updateBio(req);
      if (sub === "profile" && sub2 === "visibility" && isPut(req)) return updateVisibility(req);
      if (sub === "profile" && sub2 === "pinned-articles" && isGet(req)) return pinnedArticles();
      if (sub === "profile" && sub2 === "pinned-articles" && isPut(req)) return updatePinnedArticles(req);
      if (sub === "security" && isGet(req)) return security(req);
      if (sub === "email" && sub2 === "send-code" && isPost(req)) return sendBindEmailCode(req);
      if (sub === "email" && s.length === 3 && isPut(req)) return bindEmail(req);
      if (sub === "uploads" && s.length === 3 && isGet(req)) return uploads(req);
      if (sub === "uploads" && s.length === 4 && isDelete(req)) return deleteUpload(req);
      if (sub === "business-cards" && sub2 === "equip" && isPut(req)) return equipBusinessCard();
      if (sub === "business-cards" && isGet(req)) return businessCards();
      if (sub === "avatars" && sub2 === "equip" && isPut(req)) return equipAvatar();
      if (sub === "avatars" && sub2 === "upload-custom" && isPut(req)) return uploadCustomAvatar(req);
      if (sub === "avatars" && s.length === 3 && isGet(req)) return avatars();
      if (sub === "exp" && sub2 === "daily" && isGet(req)) return dailyExp();
      return error(404, "\u63A5\u53E3\u4E0D\u5B58\u5728");
    }
    // ── 上传 ─────────────────────────────────────────
    case "direct-upload": {
      if (sub === "sign" && isPost(req)) return sign(req);
      if (sub === "complete" && isPost(req)) return complete(req);
      if (sub === "raw" && s.length === 4 && isPut(req)) return rawUpload(req);
      return error(404, "\u63A5\u53E3\u4E0D\u5B58\u5728");
    }
    case "uploads": {
      if (s.length === 3 && isGet(req)) return serve(req);
      return error(404, "\u63A5\u53E3\u4E0D\u5B58\u5728");
    }
    // ── 公开站点设置 ──────────────────────────────
    case "settings": {
      if (sub === "public" && isGet(req)) return publicSettings();
      return error(404, "\u63A5\u53E3\u4E0D\u5B58\u5728");
    }
    // ── 后台管理 ─────────────────────────────────────
    case "admin": {
      if (sub === "stats" && isGet(req)) return stats(req);
      if (sub === "users" && s.length === 3 && isGet(req)) return users(req);
      if (sub === "users" && s.length === 4 && isPatch(req)) return updateUser(req);
      if (sub === "posts" && s.length === 3 && isGet(req)) return posts(req);
      if (sub === "posts" && s.length === 4 && isPatch(req)) return updatePost(req);
      if (sub === "comments" && s.length === 3 && isGet(req)) return comments2(req);
      if (sub === "comments" && s.length === 4 && isDelete(req)) return deleteComment(req);
      if (sub === "categories" && s.length === 3 && isGet(req)) return categories(req);
      if (sub === "categories" && s.length === 3 && isPost(req)) return createCategory(req);
      if (sub === "categories" && s.length === 4 && isPut(req)) return updateCategory(req);
      if (sub === "categories" && s.length === 4 && isDelete(req)) return deleteCategory(req);
      if (sub === "reports" && s.length === 3 && isGet(req)) return reports(req);
      if (sub === "reports" && s.length === 4 && isPost(req)) return processReport(req);
      if (sub === "emotes" && s.length === 3 && isGet(req)) return adminList(req);
      if (sub === "emotes" && s.length === 3 && isPost(req)) return createEmote(req);
      if (sub === "emotes" && s.length === 4 && isDelete(req)) return deleteEmote(req);
      if (sub === "emotes" && sub2 === "groups" && s.length === 4 && isPost(req)) return addGroup(req);
      if (sub === "emotes" && sub2 === "groups" && s.length === 5 && isDelete(req)) return deleteGroup(req);
      if (sub === "settings" && isGet(req)) return settings(req);
      if (sub === "settings" && isPut(req)) return updateSettings(req);
      return error(404, "\u63A5\u53E3\u4E0D\u5B58\u5728");
    }
    // ── 外围功能（桩） ───────────────────────────────
    case "check-in": {
      if (sub === "status" && isGet(req)) return checkInStatus();
      if (s.length === 2 && isPost(req)) return checkIn();
      return error(404, "\u63A5\u53E3\u4E0D\u5B58\u5728");
    }
    case "benefits": {
      if (sub === "me" && isGet(req)) return benefitsMe();
      return error(404, "\u63A5\u53E3\u4E0D\u5B58\u5728");
    }
    case "exam": {
      if (sub === "status" && isGet(req)) return examStatus();
      if (sub === "start" && isPost(req)) return examStart();
      if (sub === "submit" && isPost(req)) return examSubmit();
      if (sub === "review" && isGet(req)) return examReview();
      return error(404, "\u63A5\u53E3\u4E0D\u5B58\u5728");
    }
    case "presence": {
      if (sub === "ping" && isPost(req)) return presencePing(req);
      return error(404, "\u63A5\u53E3\u4E0D\u5B58\u5728");
    }
    case "emotes": {
      if (sub === "manifest" && isGet(req)) return manifest();
      return error(404, "\u63A5\u53E3\u4E0D\u5B58\u5728");
    }
    case "agent": {
      if (sub === "characters" && isGet(req)) return agentCharacters();
      return error(404, "\u63A5\u53E3\u4E0D\u5B58\u5728");
    }
    case "dm": {
      if (sub === "conversations" && s.length === 3 && isGet(req)) return dmConversations();
      if (sub === "conversations" && sub2 === "direct" && isPost(req)) return dmDirect();
      if (sub === "conversations" && sub2 === "ai-session" && isPost(req)) return dmAiSession();
      if (sub === "read-all" && isPost(req)) return dmReadAll();
      if (sub === "ai" && (sub2 === "stop" || sub2 === "regenerate") && isPost(req)) return dmAiAction();
      if (sub === "socket" && sub2 === "ticket" && isPost(req)) return dmSocketTicket();
      return error(404, "\u63A5\u53E3\u4E0D\u5B58\u5728");
    }
    case "knock": {
      if (sub === "conversations" && isGet(req)) return knockConversations();
      if (sub === "stream" && isGet(req)) return knockStream();
      return error(404, "\u63A5\u53E3\u4E0D\u5B58\u5728");
    }
    default:
      return error(404, "\u63A5\u53E3\u4E0D\u5B58\u5728");
  }
}
export {
  config,
  handler as default
};
