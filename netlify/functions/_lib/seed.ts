/** 初始化种子数据：默认版块 + 管理员账号 + 基础文档（幂等，基于 Blobs） */

import { genId, getJson, setJson, userKey, userEmailKey, categoryKey, KEYS } from "./storage";
import { hashPassword } from "./auth";

const DEFAULT_CATEGORIES = [
  { name: "综合讨论", slug: "general", description: "闲聊与综合讨论", icon: "", order: 1 },
  { name: "游戏交流", slug: "game", description: "游戏攻略、版本、卡池讨论", icon: "", order: 2 },
  { name: "同人创作", slug: "creation", description: "同人图、文、视频创作分享", icon: "", order: 3 },
  { name: "技术分享", slug: "tech", description: "开发、工具与黑科技", icon: "", order: 4 },
  { name: "公告", slug: "announce", description: "平台公告（仅管理员发布）", icon: "", order: 99, adminOnly: true },
];

export async function ensureSeed(): Promise<void> {
  // 幂等：settings 已存在则跳过
  const existing = await getJson<unknown>(KEYS.settings);
  if (existing) return;

  // ── 默认版块 ──────────────────────────────
  for (const c of DEFAULT_CATEGORIES) {
    await setJson(categoryKey(genId()), {
      document_id: genId(),
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

  // ── 管理员账号 ─────────────────────────────
  const adminEmail = (process.env.ADMIN_INITIAL_EMAIL || "admin@example.com").toLowerCase();
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD || "admin123456";
  const adminDocumentId = genId();
  const passHash = await hashPassword(adminPassword);
  await setJson(userKey(adminDocumentId), {
    document_id: adminDocumentId,
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

  // ── 站点设置 / 统计 / 信息流索引 ─────────────
  await setJson(KEYS.settings, {
    siteName: "绳网",
    announcement: "",
    allowRegister: true,
    needAudit: false,
  });
  await setJson(KEYS.stats, {
    userCount: 1,
    postCount: 0,
    commentCount: 0,
    viewCount: 0,
  });
  await setJson(KEYS.feed, { posts: [] });
}
