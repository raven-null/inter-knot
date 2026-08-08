/** 初始化种子数据：默认版块 + 管理员账号（幂等） */

import { db, genId } from "./db";
import { hashPassword } from "./auth";

const DEFAULT_CATEGORIES = [
  { name: "综合讨论", slug: "general", description: "闲聊与综合讨论", icon: "", order: 1 },
  { name: "游戏交流", slug: "game", description: "游戏攻略、版本、卡池讨论", icon: "", order: 2 },
  { name: "同人创作", slug: "creation", description: "同人图、文、视频创作分享", icon: "", order: 3 },
  { name: "技术分享", slug: "tech", description: "开发、工具与黑科技", icon: "", order: 4 },
  { name: "公告", slug: "announce", description: "平台公告（仅管理员发布）", icon: "", order: 99, adminOnly: true },
];

const SEED_KEY = "seeded:001";

export async function ensureSeed(): Promise<void> {
  const d = db();
  const rows = await d.sql`SELECT value FROM settings WHERE key = ${SEED_KEY}`;
  if (rows.length > 0) return;

  const client = await d.pool.connect();
  try {
    await client.query("BEGIN");

    for (const c of DEFAULT_CATEGORIES) {
      await client.query(
        `INSERT INTO categories (document_id, name, slug, description, icon, sort_order, is_admin_only)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [genId(), c.name, c.slug, c.description, c.icon, c.order, c.adminOnly ?? false],
      );
    }

    // 默认管理员（可用环境变量覆盖）
    const adminEmail = (process.env.ADMIN_INITIAL_EMAIL || "admin@example.com").toLowerCase();
    const adminPassword = process.env.ADMIN_INITIAL_PASSWORD || "admin123456";
    const existing = await client.query("SELECT id FROM users WHERE email = $1", [adminEmail]);
    if (existing.rowCount === 0) {
      const passHash = await hashPassword(adminPassword);
      await client.query(
        `INSERT INTO users (document_id, username, email, password_hash, name, role)
         VALUES ($1, $2, $3, $4, $5, 'admin')`,
        [genId(), "管理员", adminEmail, passHash, "管理员"],
      );
    }

    await client.query("INSERT INTO settings (key, value) VALUES ($1, '1')", [SEED_KEY]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
