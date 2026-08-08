/**
 * 初始化种子数据：默认版块 + 管理员账号 + 基础文档。
 *
 * - 用 `onlyIfNew` 原子守卫避免并发部署时重复写入
 * - 对早期版本（并发 bug 导致的重复数据）做一次性去重清理（seedVersion 升级触发）
 */

import { genId, getJson, setJson, setJsonOnce, del, listKeys, userKey, userEmailKey, userUidKey, categoryKey, KEYS } from "./storage";
import { hashPassword } from "./auth";
import { generateUid } from "./uid";
import type { Doc } from "./serialize";

const SEED_VERSION = 4;
const SEED_META_KEY = "_meta.seed";

const DEFAULT_CATEGORIES = [
  { name: "综合讨论", slug: "general", description: "闲聊与综合讨论", icon: "", order: 1 },
  { name: "游戏交流", slug: "game", description: "游戏攻略、版本、卡池讨论", icon: "", order: 2 },
  { name: "同人创作", slug: "creation", description: "同人图、文、视频创作分享", icon: "", order: 3 },
  { name: "技术分享", slug: "tech", description: "开发、工具与黑科技", icon: "", order: 4 },
  { name: "公告", slug: "announce", description: "平台公告（仅管理员发布）", icon: "", order: 99, adminOnly: true },
];

async function categoryExists(slug: string): Promise<boolean> {
  const keys = await listKeys("categories/");
  for (const key of keys) {
    const c = await getJson<{ slug?: string }>(key);
    if (c && c.slug === slug) return true;
  }
  return false;
}

export async function ensureSeed(): Promise<void> {
  const settings = await getJson<unknown>(KEYS.settings);

  if (!settings) {
    // 原子守卫：只有一个并发调用能成功写入 settings 并继续播种
    const gained = await setJsonOnce(KEYS.settings, {
      siteName: "绳网",
      announcement: "",
      allowRegister: true,
      needAudit: false,
    });
    if (!gained) return; // 其它并发调用已接管播种

    // 版块（带 slug 存在性检查，双重防重）
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
        created_at: new Date().toISOString(),
      });
    }

    // 管理员
    const adminEmail = (process.env.ADMIN_INITIAL_EMAIL || "admin@example.com").toLowerCase();
    if (!(await getJson<unknown>(userEmailKey(adminEmail)))) {
      const adminDocumentId = genId();
      const uid = await generateUid();
      const passHash = await hashPassword(process.env.ADMIN_INITIAL_PASSWORD || "admin123456");
      await setJson(userKey(adminDocumentId), {
        document_id: adminDocumentId,
        uid,
        username: "管理员",
        name: "管理员",
        email: adminEmail,
        password_hash: passHash,
        avatar_url: "/images/default-avatar.webp",
        bio: "",
        level: 1,
        exp: 0,
        role: "admin",
        status: "active",
        profile_hidden: false,
        created_at: new Date().toISOString(),
        stats: { articleCount: 0, commentCount: 0, totalViews: 0, totalLikes: 0, totalComments: 0 },
        followersCount: 0,
        followingCount: 0,
      });
      await setJson(userEmailKey(adminEmail), { document_id: adminDocumentId });
      await setJson(userUidKey(uid), { document_id: adminDocumentId });
    }

    await setJson(KEYS.stats, { userCount: 1, postCount: 0, commentCount: 0, viewCount: 0 });
    await setJson(KEYS.feed, { posts: [] });
  }

  // ── 一次性清理：修复早期并发播种产生的重复版块/管理员 ──
  const meta = (await getJson<{ seedVersion?: number }>(SEED_META_KEY)) ?? {};
  if (Number(meta.seedVersion || 0) < SEED_VERSION) {
    await cleanupDuplicates();
    await fixCategoryIds();
    await setJson(SEED_META_KEY, { seedVersion: SEED_VERSION });
  }
}

/**
 * 修复历史 bug：`createCategory` 曾用两个不同的 genId() 分别作为 blob key 与
 * document_id，导致前端拿 documentId 删除/更新时定位到不存在的 key（删除静默失败、
 * 标签删不掉）。此函数把所有版块文档的 document_id 对齐为 blob key 中的 id。
 */
async function fixCategoryIds(): Promise<void> {
  const catKeys = await listKeys("categories/");
  for (const key of catKeys) {
    const c = await getJson<Doc>(key);
    if (!c) continue;
    const idFromKey = key.slice("categories/".length, -".json".length);
    const currentDocId = String(c.document_id || "");
    if (currentDocId && currentDocId !== idFromKey) {
      await setJson(key, { ...c, document_id: idFromKey });
    }
  }
}

/** 版块按 slug 去重；管理员按邮箱去重（保留邮箱索引指向的那个，删除其余） */
async function cleanupDuplicates(): Promise<void> {
  // 版块去重
  const catKeys = await listKeys("categories/");
  const seen = new Map<string, string>();
  for (const key of catKeys) {
    const c = await getJson<{ slug?: string }>(key);
    if (!c || !c.slug) continue;
    const existing = seen.get(c.slug);
    if (existing) {
      await del(key);
    } else {
      seen.set(c.slug, key);
    }
  }

  // 管理员去重（仅处理有邮箱的用户）
  const userKeys = (await listKeys("users/")).filter((k) => !k.includes("/by-email/"));
  const byEmail = new Map<string, string[]>();
  for (const key of userKeys) {
    const u = await getJson<{ email?: string; role?: string }>(key);
    if (!u || !u.email) continue;
    const list = byEmail.get(u.email) || [];
    list.push(key);
    byEmail.set(u.email, list);
  }
  for (const [email, keys] of byEmail) {
    if (keys.length <= 1) continue;
    // 邮箱索引当前指向的 documentId 优先保留，否则保留第一个
    const idx = await getJson<{ document_id?: string }>(userEmailKey(email));
    let keepKey: string | null = null;
    for (const key of keys) {
      const u = await getJson<{ document_id?: string }>(key);
      if (idx && u?.document_id === idx.document_id) keepKey = key;
    }
    if (!keepKey) keepKey = keys[0]!;
    for (const key of keys) {
      if (key !== keepKey) await del(key);
    }
    const kept = await getJson<{ document_id?: string }>(keepKey);
    if (kept?.document_id) await setJson(userEmailKey(email), { document_id: kept.document_id });
  }

  // UID 回填：为早期创建（无 uid 字段）的用户分配唯一 8 位 UID
  const uidKeys = (await listKeys("users/")).filter(
    (k) => !k.includes("/by-email/") && !k.includes("/by-uid/"),
  );
  for (const key of uidKeys) {
    const u = await getJson<Doc>(key);
    if (!u || u.uid != null) continue;
    const documentId = String(u.document_id || "");
    if (!documentId) continue;
    const uid = await generateUid();
    await setJson(key, { ...u, uid });
    await setJson(userUidKey(uid), { document_id: documentId });
  }
}
