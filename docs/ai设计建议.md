# 论坛网站设计建议（可部署到 Netlify）

> 目标：一个同时具备**前台（用户论坛）**与**后台（管理端）**、**前端 + 后端**的完整论坛网站，可部署到 Netlify。

---

## 一、总体思路

Netlify 本身是"静态站点 + 无服务器"平台，没有常驻服务器。因此"后端"用 **Netlify Functions（无服务器函数）** 实现，数据用 **数据库** 存储，前端则是静态页面（HTML/JS/CSS），由 Netlify 的 CDN 托管。整体是 **前后端分离** 架构：

```
浏览器（游客/用户/管理员）
        │
        │ HTTPS
        ▼
┌─────────────────────────────┐
│   Netlify CDN（静态前端）    │
│   ├─ 前台论坛页面            │
│   └─ 后台管理页面            │
└──────────┬──────────────────┘
           │ /api/*
           ▼
┌─────────────────────────────┐
│   Netlify Functions（后端）  │
│   用户/帖子/评论/权限/统计    │
└──────────┬──────────────────┘
           ▼
┌─────────────────────────────┐
│   数据库（Postgres）         │
│   Netlify Database / Supabase│
└─────────────────────────────┘
```

- **前台**：游客浏览帖子、注册登录、发帖回帖、点赞、搜索、个人中心。
- **后台**：管理员登录后进入独立管理面板，管理版块、用户、帖子审核、公告、站点配置、数据统计。

---

## 二、技术选型（方案对比）

| 环节 | 推荐方案 | 备选 | 说明 |
|------|----------|------|------|
| 前端框架 | Vue 3 + Vite | React + Vite / Nuxt 3 | 前台与后台共用一套工程，按路由区分 |
| 样式 | Tailwind CSS + 组件库（Element Plus / shadcn） | 手写 CSS | 快速搭出论坛与管理后台界面 |
| 后端 | Netlify Functions（TypeScript） | Edge Functions | 函数与站点一起部署、可回滚，代码即配置 |
| 数据库 | **Netlify Database（Postgres）** | Supabase（免费额度高） | 见下方对比 |
| 认证 | JWT（自实现，放入 HttpOnly Cookie） | Netlify Identity / Supabase Auth | 论坛业务简单，JWT 足够 |
| 文件/图片上传 | Netlify Blobs + 转 WebP | 对象存储（S3） | 头像、帖子配图 |
| 图片转 WebP | 客户端 canvas + 服务端 sharp 双层 | 纯 WASM 方案（@jsquash/webp） | 详见第九节 |
| 部署 | Netlify 一键连 GitHub 自动部署 | — | 已有 Git 仓库，直接关联 |

### 数据库选型详细对比

| 项 | Netlify Database | Supabase |
|----|------------------|----------|
| 类型 | 托管 Postgres，平台原生集成 | 外部 Postgres + Auth + Storage 全家桶 |
| 免费额度 | 3 个库 / 账户，48 计算单位·周期，存储 5GB，带宽 5GB | 免费 500MB 数据库 + 认证 + 存储 |
| 本地开发 | Netlify CLI 内置，支持数据库分支 | 独立 SDK，本地需自行连库 |
| 迁移 | 内置迁移系统，随部署自动执行 | 需自己管理迁移 |
| 适用场景 | 中小论坛，不想折腾外部服务 | 想要现成认证/文件存储/实时订阅 |

> 结论：**推荐 Netlify Database**，与 Functions、部署流水线、Deploy Preview 深度集成，且论坛数据量小，免费额度足够。若预算敏感或想要现成文件存储/认证，选 Supabase。

---

## 三、项目目录结构（建议）

采用前后端同仓库、一个前端工程 + 一个函数目录的方式：

```
04-inter-knot/
├─ index.html
├─ vite.config.ts            # 构建配置（Netlify 可直接识别）
├─ netlify.toml              # Netlify 部署配置（见第八节）
├─ package.json
├─ .env.example              # 环境变量模板（真实 .env 不提交）
├─ src/                      # 前端代码
│  ├─ main.ts
│  ├─ router/                # 路由（含前台/后台两套布局）
│  ├─ layouts/
│  │  ├─ FrontLayout.vue     # 前台布局（顶栏/导航/页脚）
│  │  └─ AdminLayout.vue     # 后台布局（侧边栏菜单）
│  ├─ views/
│  │  ├─ front/              # 前台页面
│  │  │  ├─ Home.vue         # 首页（帖子列表/版块导航）
│  │  │  ├─ Login.vue / Register.vue
│  │  │  ├─ Category.vue     # 版块内帖子列表
│  │  │  ├─ PostDetail.vue   # 帖子详情 + 回帖
│  │  │  ├─ PostEditor.vue   # 发帖/编辑
│  │  │  └─ Profile.vue      # 个人中心
│  │  └─ admin/              # 后台页面
│  │     ├─ Dashboard.vue    # 数据概览
│  │     ├─ Users.vue        # 用户管理
│  │     ├─ Categories.vue   # 版块管理
│  │     ├─ Posts.vue        # 帖子审核/管理
│  │     ├─ Comments.vue     # 评论管理
│  │     └─ Settings.vue     # 站点设置
│  ├─ api/                   # 统一封装 fetch，调用 /api/*
│  ├─ stores/                # 用户会话、权限状态
│  ├─ utils/
│  │  ├─ image.ts            # 客户端图片转 WebP + 压缩（见第九节）
│  │  └─ index.ts            # 其他通用工具
│  └─ assets/
├─ netlify/functions/        # 后端（Netlify Functions）
│  ├─ _shared/               # 共享代码
│  │  ├─ db.ts               # 数据库连接（复用连接池）
│  │  ├─ auth.ts             # JWT 签发/校验中间件
│  │  ├─ roles.ts            # 权限判断
│  │  ├─ image.ts            # 服务端 WebP 转换/尺寸限制/元数据剥离
│  │  └─ responses.ts        # 统一响应格式
│  ├─ upload.ts              # 图片上传：接收→转 WebP→存 Blobs（见第九节）
│  ├─ auth-login.ts
│  ├─ auth-register.ts
│  ├─ users.ts
│  ├─ posts.ts
│  ├─ comments.ts
│  ├─ likes.ts
│  ├─ categories.ts
│  ├─ admin-users.ts
│  ├─ admin-posts.ts
│  └─ admin-stats.ts
└─ migrations/               # Netlify Database 数据库迁移
   └─ 0001_init.sql
```

> 提示：用 `netlify.toml` 的 path 配置把函数挂在 `/api/xxx` 路由下（见第八节），前端统一请求 `/api/*`，与域名解耦。

---

## 四、数据存储设计

> **落地变更（2026-08）**：实际实现已改为**全部使用 Netlify Blobs** 存储，不再使用 Postgres / Netlify Database。
> 结构化数据（用户/帖子/评论/点赞等）以 JSON 文档存入 `data` store；信息流用 `_indexes/feed.json` 索引文档（一次读取即可排序分页）；上传图片字节存 `uploads` store。优点：无数据库、无迁移、部署零配置；适用中小数据量，超大并发时建议换回关系库或加缓存。

原设计（Postgres 表结构）保留如下供参考：

```sql
-- 用户表
users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,            -- 用 bcrypt 等慢哈希
  avatar_url    TEXT,
  bio           TEXT,
  role          TEXT NOT NULL DEFAULT 'user',  -- user / moderator / admin
  status        TEXT NOT NULL DEFAULT 'active',-- active / banned
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 版块
categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  icon        TEXT,
  sort_order  INT DEFAULT 0,
  is_hidden   BOOLEAN DEFAULT false
);

-- 帖子
posts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id   UUID REFERENCES categories(id) ON DELETE CASCADE,
  author_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  content       TEXT NOT NULL,
  is_pinned     BOOLEAN DEFAULT false,       -- 置顶
  status        TEXT NOT NULL DEFAULT 'published', -- published / pending / deleted
  like_count    INT DEFAULT 0,
  view_count    INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_posts_category ON posts(category_id, created_at DESC);
CREATE INDEX idx_posts_author  ON posts(author_id);

-- 评论（支持楼主帖 + 回帖）
comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID REFERENCES posts(id) ON DELETE CASCADE,
  author_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  content    TEXT NOT NULL,
  parent_id  UUID REFERENCES comments(id),    -- 可选：楼中楼
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_comments_post ON comments(post_id, created_at);

-- 点赞
likes (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID REFERENCES users(id) ON DELETE CASCADE,
  post_id   UUID REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, post_id)                   -- 防止重复点赞
);

-- 站点配置（键值对）
settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- 通知（可选）
notifications (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID REFERENCES users(id) ON DELETE CASCADE,
  content   TEXT,
  is_read   BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

设计要点：
- 所有 SQL 一律用**参数化查询**（`$1` 占位符），防 SQL 注入。
- 计数（like_count 等）用触发器或应用内事务维护，保证一致性。
- 帖子内容区分 `pending`（待审核）与 `published`，便于后台审核流程。
- 用户被禁用（banned）时，校验登录态直接拒绝。

---

## 五、后台 API 设计（RESTful）

统一响应格式：`{ "code": 0, "data": ..., "message": "ok" }`

### 前台接口（用户侧）

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | /api/auth/register | 注册 | 公开 |
| POST | /api/auth/login | 登录（签发 JWT） | 公开 |
| POST | /api/auth/logout | 登出 | 登录 |
| GET | /api/auth/me | 获取当前用户 | 登录 |
| GET | /api/categories | 版块列表 | 公开 |
| GET | /api/posts?category=&page=&keyword= | 帖子列表/搜索/分页 | 公开 |
| GET | /api/posts/:id | 帖子详情 + 回帖 | 公开 |
| POST | /api/posts | 发帖 | 登录 |
| PUT | /api/posts/:id | 编辑自己的帖子 | 作者 |
| POST | /api/comments | 发表评论 | 登录 |
| POST | /api/likes/:postId | 点赞/取消点赞 | 登录 |
| POST | /api/upload/images | 图片上传（自动转 WebP，返回 URL） | 登录 |
| GET | /api/users/:id | 用户公开主页 | 公开 |

### 后台接口（管理员侧）

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | /api/admin/stats | 数据概览（用户数/帖数/评论数/活跃） | 管理员 |
| GET | /api/admin/users | 用户列表（分页/搜索） | 管理员 |
| PATCH | /api/admin/users/:id | 禁用/启用/改角色 | 管理员 |
| GET | /api/admin/posts | 帖子管理（含待审核） | 管理员/版主 |
| PATCH | /api/admin/posts/:id | 通过/下架/删除/置顶 | 管理员/版主 |
| GET | /api/admin/comments | 评论管理 | 管理员 |
| DELETE | /api/admin/comments/:id | 删除评论 | 管理员 |
| POST/PUT/DELETE | /api/admin/categories | 版块增删改 | 管理员 |
| GET/PUT | /api/admin/settings | 站点配置读写 | 管理员 |

---

## 六、权限模型

| 角色 | 权限 |
|------|------|
| 游客 | 浏览版块、帖子、评论；注册登录 |
| 用户 | 发帖、回帖、点赞、编辑自己的帖子、个人中心 |
| 版主 | 帖子审核、置顶、删除违规内容（限定版块） |
| 管理员 | 全部权限：用户/版块/配置/统计 |

实现：JWT 中携带 `role`，函数侧 `auth.ts` 校验后把用户信息挂到请求上下文，`roles.ts` 做中间件判断，函数内用。

---

## 七、前台 & 后台页面功能清单

### 前台（用户论坛）
- 首页：版块导航 + 最新/热门帖子列表 + 搜索框 + 置顶帖。
- 版块页：某一版块下的帖子列表（分页）。
- 帖子详情：正文、点赞、评论列表（支持楼中楼）、发评论框。
- 发帖页：选版块、标题、正文（Markdown 编辑器 + 图片上传）。
- 登录/注册：表单 + 校验，登录态存 HttpOnly Cookie。
- 个人中心：资料编辑、我的帖子、我的点赞。

### 后台（管理端）
- 概览：关键指标卡片 + 最近数据趋势（用户/帖/评论增长）。
- 用户管理：列表、搜索、禁用/启用、改角色。
- 版块管理：新增/编辑/排序/隐藏版块。
- 帖子管理：待审核队列、下架/删除/置顶。
- 评论管理：删除违规评论。
- 站点设置：站点名、公告、注册开关、审核开关。

---

## 八、Netlify 部署方案

### 1. 部署配置示例（netlify.toml）

```toml
[build]
  command = "npm run build"
  publish = "dist"          # Vite 构建输出目录

[functions]
  directory = "netlify/functions"

# 把函数挂到 /api/* 统一路由（简化前端请求地址）
[[functions."auth-login"]]
  path = "/api/auth/login"
[[functions."auth-register"]]
  path = "/api/auth/register"
[[functions."posts"]]
  path = "/api/posts"
[[functions."comments"]]
  path = "/api/comments"
[[functions."upload"]]
  path = "/api/upload/images"
[[functions."admin-stats"]]
  path = "/api/admin/stats"

# SPA 前端路由回退到 index.html
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### 2. 部署步骤
1. 项目推到 GitHub（现有仓库可直接用）。
2. Netlify → Add new site → Import an existing project → 选该仓库。
3. Build command 填 `npm run build`，Publish directory 填 `dist`。
4. 首次部署完成后，在 Site settings → Environment variables 填入密钥（见下）。
5. 以后每次 `git push` 自动重新构建部署；PR 会自动生成 Deploy Preview。

### 3. 环境变量（务必走环境变量，不写进代码）
- `DATABASE_URL`（Netlify Database / Supabase 连接串）
- `JWT_SECRET`（签发令牌的密钥）
- `ADMIN_INITIAL_EMAIL` / `ADMIN_INITIAL_PASSWORD`（首次初始化管理员）

### 4. 需要注意的免费额度（避免超限）
| 项 | Free 档限制 | 论坛对策 |
|----|-------------|----------|
| Functions 调用 | 125,000 次/月 | 列表页加缓存，减少请求 |
| Functions 运行时间 | 约 125,000 秒/月 | 查询加索引、只取所需字段 |
| Netlify Database | 每库周期 48 计算单位、带宽 5GB、写数据 5GB、存储 5GB | 控制分页大小，开启"空闲 5 分钟休眠" |
| 带宽/站点 | 100 GB/月 | 图片走 CDN 压缩 |

### 5. 进阶（可选）
- 自定义域名 + 自动 HTTPS（免费）。
- 用 Netlify Blobs 存头像/配图，配合图片 CDN 压缩。
- 定时函数（Scheduled Functions）做每日数据归档或清理。

---

## 九、图片上传与 WebP 转换方案

> 目的：用户上传的图片（尤其手机拍照）体积大，统一转为 WebP 并压缩，减少存储与带宽占用，同时保护隐私（剥离 EXIF/GPS）。

### 1. 处理流程（双层策略）

```
用户选择图片
      │
      ▼
① 客户端预处理（浏览器）
   校验类型/大小 → canvas 解码 → 转 WebP（quality≈80）
   → 压缩后体积显著变小 → 只上传处理后的数据
      │  即使客户端没转成功
      ▼
② 服务端兜底（/api/upload/images）
   校验格式/大小 → sharp 转 WebP
   → 限制最长边、剥离 EXIF/GPS 元数据
   → 存入 Netlify Blobs → 返回图片 URL
      │
      ▼
③ 展示时（Netlify Image CDN）
   访问 URL 时按需 ?width=&format=webp 缩放/再压缩
```

- **① 客户端先转**：`canvas.toBlob('image/webp')` 零依赖即可实现，大幅减小上传流量、加快上传速度；对老浏览器自动降级为原图直传。
- **② 服务端兜底**：保证"入库即 WebP"，统一格式、裁剪尺寸、剥离 EXIF/GPS，防止伪造 MIME 与超大图。转换库选型见下。
- **③ 展示再优化**：Netlify Image CDN 按设备尺寸按需缩放，避免把原尺寸图下发给手机。

### 2. 服务端转换库选型

| 方案 | 说明 | 适用 |
|------|------|------|
| **sharp** | 性能极强、功能全（转换/缩放/裁剪/剥离元数据） | 推荐。Netlify Functions 可直接安装，注意部署体积与冷启动 |
| @jsquash/webp | 纯 WASM，无原生依赖，浏览器/服务端通用 | 想统一两端、或介意 sharp 原生依赖时可选 |

> 推荐 **sharp**：质量与速度最好，`sharp(buf).webp({ quality: 80 })` 一行完成转换；同时 `stripMetadata()` 直接剥离 EXIF。若担心函数打包体积，改选 `@jsquash/webp`。

### 3. 上传与转换规则（建议默认值）

| 规则 | 建议值 | 说明 |
|------|--------|------|
| 格式白名单 | jpeg / png / webp | 其余类型直接拒绝；GIF 仅接受静态帧或拒绝 |
| 单张大小上限 | ≤ 10 MB（原始文件） | 服务端强校验，超限报错 |
| 输出格式 | webp | 统一 |
| 输出质量 | quality = 80 | 体积与画质平衡 |
| 最长边 | ≤ 2048 px | 超宽/超高图等比缩小，限制尺寸防滥用 |
| 输出体积上限 | ≤ 1 MB | 仍超限则继续降质到 quality = 60 |
| 元数据 | 全部剥离（EXIF/GPS/ICC） | 保护隐私、进一步减小体积 |
| 文件名 | 随机 UUID + `.webp` | 防止枚举与路径注入 |

### 4. 存储与引用

- 图片存 **Netlify Blobs**，key 形如 `uploads/<uuid>.webp`，返回 URL 形如 `https://站点域名/uploads/<uuid>.webp`。
- 帖子正文/头像中直接引用该 URL；列表页请求时用 Image CDN 参数 `?width=320&format=webp` 取缩略图。
- 垃圾清理：可加定时函数，删除 30 天前无引用（未被帖子/头像引用）的 Blob。

### 5. 客户端工具函数（示意）

```ts
// src/utils/image.ts
export async function toWebp(file: File, maxEdge = 2048, quality = 0.8): Promise<Blob> {
  const img = await createImageBitmap(file);
  const { width, height } = fitWithin(img, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob(res, 'image/webp', quality),
  );
  if (!blob) throw new Error('图片转换失败');
  return blob;
}
```

### 6. 服务端兜底函数（示意）

```ts
// netlify/functions/upload.ts
// v2 语法：导出默认的 (req, context) => {} 处理函数
import sharp from 'sharp';
import { getStore } from '@netlify/blobs';
import type { Config, Context } from '@netlify/functions';

export default async (req: Request, context: Context) => {
  // ...鉴权（JWT，可从 context 读取认证信息）

  // getStore() 必须在 handler 内部调用，
  // 不要在模块顶层缓存 store 实例（冷启动/实例复用下更安全）
  const store = getStore('uploads');

  const form = await req.formData();
  const file = form.get('image') as File | null;
  if (!file) return Response.json({ code: 400, message: '缺少图片' }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return Response.json({ code: 413, message: '图片过大' }, { status: 413 });

  const key = `uploads/${crypto.randomUUID()}.webp`;
  await store.set(key, await sharp(await file.arrayBuffer())
    .rotate()                    // 按 EXIF 方向矫正（再剥离）
    .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer(), { metadata: { contentType: 'image/webp' } });

  return Response.json({ code: 0, data: { url: `/${key}` } });
};

export const config: Config = {
  path: '/api/upload/images',
};
```

### 7. 注意事项
- **sharp 部署体积**：函数打包会把原生二进制带上，保持 `netlify/functions` 体积精简，避免冷启动变慢；也可用 `@jsquash/webp` 替代。
- **内存限制**：Functions 单函数内存约 1024 MB，超大图（>10MB）先拒绝，再处理，避免 OOM。
- **v2 函数写法**：所有 Serverless Function 统一用 v2 语法 `export default async (req, context) => {}` + `export const config`，并在 **handler 内部** 调用 `getStore()`，不要放在模块顶层（实例复用/冷启动下更安全、避免跨请求共享 store）。
- **安全校验不可只靠前端**：前端压缩只是优化体验，服务端必须再次校验 MIME、大小并剥离元数据。
- **透明图片**：PNG 带透明通道转 WebP 时若直接按 JPEG 思路压缩会失真，注意 `png()` 保留 alpha 后再转 webp。

---

## 十、安全与性能要点

- **XSS**：前端渲染 Markdown 前先消毒；所有用户输入按纯文本转义输出。
- **SQL 注入**：一律参数化查询。
- **CSRF**：JWT 放 HttpOnly + SameSite Cookie，且对写操作做来源校验。
- **限流**：登录/注册/发帖接口做频率限制（函数内存或数据库计数），防刷。
- **密码**：bcrypt 慢哈希，绝不存明文。
- **文件上传**：限制类型与大小，服务端统一转 WebP、剥离 EXIF/GPS，文件名随机化，禁止执行脚本。
- **内容审核**：后台"待审核"队列；可接入敏感词过滤。
- **缓存**：帖子列表、首页用 Netlify 边缘缓存，减轻函数与数据库压力。
- **备份**：Netlify Database 自带按计划备份，关键数据可再定期导出。

---

## 十一、开发路线图（里程碑）

| 阶段 | 内容 | 验收标准 |
|------|------|----------|
| M1 基础架构 | 前端工程 + Functions + 数据库连通，登录注册 | 能注册登录，JWT 生效 |
| M2 前台核心 | 版块、发帖、帖子详情、回帖、点赞、搜索 | 论坛基本可用 |
| M3 后台 | 管理端登录、用户/版块/帖子/评论管理、统计 | 后台可管理全部内容 |
| M4 打磨 | 个人中心、置顶、审核流、图片转 WebP 上传、公告 | 功能完整 |
| M5 上线 | 部署到 Netlify、配域名、监控与备份 | 生产环境稳定运行 |

---

## 十二、风险与注意事项

- Netlify Functions 无持久内存，**连接池不要依赖进程级全局状态**；Postgres 连接建议短连接或使用数据库自带的连接复用（Netlify Database 已优化 serverless 场景）。
- 冷启动会让首次请求变慢，规模小影响可忽略；可考虑 Edge Functions 处理高频读接口。
- 免费档 Database 存储自 2026-07-01 起按量计费，上线前关注账单；数据量小、额度低即可。
- JWT 密钥、数据库连接串等敏感信息**绝不提交**到 Git（写进 `.env.example` 占位，真实值只放 Netlify 环境变量）。
- 若后续用户量大，可平滑迁移到 Supabase 或自建 Postgres，应用层 SQL 保持标准即可。
