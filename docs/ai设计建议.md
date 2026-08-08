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

---

## 十三、米游社扫码登录实现方案

> 现状：本项目米游社登录为"暂未开放"桩接口（`POST /api/auth/mihoyo/qr` 返回 501）。
> 本节说明若要实现真实扫码登录的完整方案。**注意：以下为基于社区逆向的非官方方案，接入前请先阅读下方「风险与合规」小节。**

### 1. 原理：米游社 Web 扫码登录三步

官方 Web 端（`https://webstatic.mihoyo.com/`）扫码登录流程分三步：

```
① 生成二维码
   POST passport-api.mihoyo.com/account/auth/login/qrcode/generate
   → 返回 { url(渲染成二维码), ticket, app_id, ... }

② 轮询扫码状态（1.5~3s 一次）
   POST passport-api.mihoyo.com/account/auth/login/qrcode/query
   body: { app_id, device: <设备ID>, ticket }
   → status: waiting / scanned / confirmed / expired / cancelled
   confirmed 时返回可兑换的 loginTicket

③ 兑换登录态
   POST passport-api.mihoyo.com/account/auth/login  body: { ticket, app_id, device }
   → 换取 stoken / ltoken / mid 等
   再用 stoken 调
   POST passport-api.mihoyo.com/account/auth/api/getUserAccountInfoByToken
   → 拿到米游社账号信息（mid / 昵称 / 头像）
```

### 2. 私有请求头（关键，会随版本变动）

米游社接口对请求头校验较严，需模拟 Web 客户端：

| 头 | 说明 |
|----|------|
| `x-rpc-app_id` | Web 端固定值（如 `c8b4368fbd084c49b2e02907c214e571`，社区逆向得出） |
| `x-rpc-client_type` | `2`（Web） |
| `x-rpc-verify` | 部分接口需要 sign 校验（社区逆向算法，需随版本维护） |
| `User-Agent` | 用浏览器 UA 或 `mihoyo_bbs/...` |
| Cookie | 至少携带 `_MHYUUID`；部分场景需先通过 `public-data-api.mihoyo.com/device-fp/api/getFp` 获取设备指纹 `DEVICEFP` |

> 这些值属于"逆向产物"，无官方文档，**随时可能被改动或封堵**，需要定期维护。

### 3. 在本项目（Netlify Functions + Blobs）中的实现设计

前端 `useMihoyoQr` / `LoginDialog` 的二维码 UI 与轮询逻辑**已就绪**，且 `useApi` 里
`MihoyoQrPollResult` 已支持 login / bind 两种模式，只需把后端桩接口替换为真实实现。

```
POST /api/auth/mihoyo/qr           → 调 generate，返回 { qrUrl, ticket, expiresIn, mode }
POST /api/auth/mihoyo/qr/status    → 调 query 轮询；confirmed 后兑换 stoken 并处理登录/绑定
GET  /api/auth/mihoyo/binding      → 读当前用户绑定
DELETE /api/auth/mihoyo/binding    → 解绑
```

**会话与用户映射（用 Blobs 存）：**

| key | 内容 |
|-----|------|
| `mihoyo/sessions/<ticket>.json` | `{ ticket, deviceId, mode(login/bind), userId?, status, createdAt }`，轮询/兑换状态机 |
| `users/by-mihoyo/<mid>.json` | 米游社 mid → 本站用户 documentId（登录建号/绑定查重） |
| `users/<docId>.json` | 用户文档中追加 `mihoyo: { mid, nickname, uid, region, lastSyncedAt }` |

**登录模式流程：**
1. `qr`：生成 `deviceId`（可用 `crypto.randomUUID()`），调 miHoYo generate，把会话写入 Blobs，返回 `{ qrUrl, ticket, mode:"login" }`。
2. `qr/status`（带 token = 未登录）：按 ticket 读会话 → 调 miHoYo query → 非 confirmed 直接透传状态；
   confirmed 后调登录/换 token 接口拿 `mid` 与账号信息。
3. 查 `users/by-mihoyo/<mid>.json`：命中则直接签发本站 JWT；未命中则按"新用户"建号
   （默认用户名 `绳网用户XXXX`，角色 user），写入 by-mihoyo 索引，签发 JWT。
4. 返回 `{ status:"confirmed", mode:"login", isNewUser, auth:{ token, user } }`，前端复用现有 `setSession`。

**绑定模式流程：**（已登录，`qr` 带 token）
1. 同上生成二维码，`mode:"bind"`，会话记录 `userId`。
2. confirmed 后拿到 mid/账号信息，校验该 mid 是否已被别的本站账号绑定（查 by-mihoyo 索引）。
3. 未占用 → 写回当前用户文档 `mihoyo` 字段 + by-mihoyo 索引，返回 `{ status:"confirmed", mode:"bind", binding }`。
4. 已占用 → 返回业务错误，提示换绑需先解绑。

**环境变量开关（建议默认关闭）：**

| 变量 | 说明 | 默认 |
|------|------|------|
| `MIHOYO_LOGIN_ENABLED` | 是否启用米游社登录（关闭时 qr 接口返回"暂未开放"） | `false` |
| `MIHOYO_APP_ID` / `MIHOYO_CLIENT_TYPE` | 覆盖默认私有参数（便于版本失效时快速维护） | 默认值 |

### 4. 前端配合（已具备，无需大改）

- `useMihoyoQr`：`createMihoyoQr` → `qrUrl` 渲染二维码；`pollMihoyoQr(ticket)` 轮询；
  `onConfirmed` 回调中按 `mode` 分发：login → `auth.setSession(token, user)` 并关闭弹窗；bind → 刷新绑定态。
- 登录弹窗 / 账号中心的米游社 Tab 保持不变。

### 5. 风险与合规（重要）

- **违反米游社服务条款**：使用其官方扫码接口为第三方站点提供登录属于未经授权的用途，可能导致相关账号被封禁。**商用/公开站点不建议接入。**
- **Serverless IP 风险**：Netlify Functions 出口为数据中心 IP，米游社反爬可能限流或要求验证码；实测不稳定，必要时改为自建 VPS 或边缘节点转发。
- **接口不稳定**：私有参数（app_id / verify 签名 / UA / DEVICEFP）属逆向产物，官方一改就失效，需持续维护。
- **无官方文档**：以上流程基于社区经验，可能存在错误；上线前必须实测 generate→query→confirm 全链路。
- 若仅需"游戏绑定展示"而非第三方登录，可跳过扫码，改为让用户在米游社网页登录后手动提交 `stoken`（同样有合规风险，谨慎评估）。

> 建议：优先保持现状（"暂未开放"提示 + 邮箱注册登录）。除非有明确的合规授权需求，否则不建议为公开论坛接入米游社登录。

---

## 十四、后台管理端页面整改方案

> 现状：后台 `/admin` 已具备概览/用户/帖子/评论/版块/设置六个页面与审核流程，但整体为"表格 + 按钮"的初版形态，信息密度、操作效率与视觉呈现有较大提升空间。本节给出整改设计。

### 1. 现状评估

**已有能力**
- 数据概览（KPI 卡片 + 最近用户/帖子）
- 用户管理（搜索、角色调整、禁用/解禁）
- 帖子管理（搜索、状态筛选、置顶/下架/通过/驳回/删除）
- 评论管理（搜索、删除）
- 版块管理（增删改、排序、隐藏）
- 站点设置（名称/公告/注册/审核开关）
- 帖子审核流程（needAudit → pending → 通过/驳回）

**主要不足**
- 纯表格形态，长列表难扫读；无批量操作、无排序、无详情预览。
- 概览只有静态数字，无趋势与图表，无法一眼看出运营状态。
- 缺**举报管理**、**审核队列专属页**、**用户详情**等关键入口。
- 视觉与前台 ZZZ 风格脱节（后台偏"通用后台"样式），缺乏品牌一致性。
- 操作反馈/空态/错误态/加载态不统一。

### 2. 整改目标与设计原则

| 原则 | 说明 |
|------|------|
| 信息优先 | 高频信息（待审数、举报数、异常用户）一屏可见，支持扫读 |
| 操作直达 | 常用操作 ≤2 次点击，批量操作成组提供 |
| 前后台一致 | 沿用前台 ZZZ 设计语言（三圆角面板、点阵纹理、主题绿 `#BFFF09`） |
| 状态可视 | 帖子/用户/举报状态用统一徽章体系表达 |
| 移动端可用 | 侧边栏在窄屏收为顶部横向 Tab |

### 3. 信息架构（导航分组）

```
后台
├─ 概览 Dashboard            /admin
├─ 内容管理
│  ├─ 待审核队列 Review       /admin/review      ← 新增，审核工作台
│  ├─ 帖子管理 Posts          /admin/posts
│  ├─ 评论管理 Comments       /admin/comments
│  └─ 举报管理 Reports        /admin/reports     ← 新增
├─ 用户
│  └─ 用户管理 Users          /admin/users
└─ 系统
   ├─ 版块管理 Categories     /admin/categories
   └─ 站点设置 Settings       /admin/settings
```

### 4. 各页面整改要点

#### 4.1 概览（Dashboard）
- KPI 卡升级：**注册用户 / 帖子总数 / 评论总数 / 总浏览 / 待审核 / 待处理举报**，卡片可点击直达对应页面；待审核/待处理用醒目的警告色。
- 新增**趋势图**：近 7/30 天「新帖、新评论、新注册」时间序列（轻量 SVG/Canvas 自绘，不引大图表库；数据由后端 `admin/stats` 扩展 `trend` 字段提供）。
- 「待审核队列」与「最新举报」两个快速面板，一键跳转处理。

#### 4.2 待审核队列（Review）—— 新增
- 独立工作台：卡片/列表双视图，展示封面、标题、作者、提交时间。
- 操作：**通过**（→published）、**驳回**（→draft，可填原因，可选记录到审核日志）、**一键通过全部**（本页）。
- 队列顶部显示"待审 N 条"，处理后可进入下一条，形成流水线体验。
- 复用现有 `updatePost` 状态接口，前端交互增强即可。

#### 4.3 帖子管理（Posts）
- 列表列：封面缩略图 + 标题（截断）、作者、分类、状态徽章、浏览/点赞/评论、时间（相对时间）。
- 新增**行内预览**：抽屉/弹窗渲染正文（复用 `useRenderedBody`），不离开列表即可审阅。
- 批量操作：多选后批量删除/批量置顶/批量下架（新增后端批量接口或前端循环）。
- 筛选：状态 + 分类 + 时间范围 + 关键词。

#### 4.4 评论管理（Comments）
- 显示所属帖子标题（可跳转定位）、作者、内容截断、点赞数。
- 行内删除 + 批量删除；删除前确认。

#### 4.5 举报管理（Reports）—— 新增
- 后端 `reports` 已有存储，补管理接口：列表（按状态 open/resolved/dismissed 筛选）、详情（举报对象类型/ID/理由）、处理动作（**删除内容**并标记 resolved、**忽略**标记 dismissed）。
- 处理时联动删除对应帖子/评论/用户（复用现有删除逻辑）。

#### 4.6 用户管理（Users）
- 列表：头像 + 用户名（链接前台主页）、UID、邮箱、等级、角色徽章、状态、注册时间。
- 新增**用户详情抽屉**：资料、统计（帖/评/浏览/点赞）、最近帖子、关注/粉丝、操作（改角色/禁封）。
- 搜索支持 UID（已生成数字 UID，可精确匹配）。

#### 4.7 版块管理（Categories）
- 拖动排序（前后端已有 `sort_order`）。
- 显示每个版块的帖子数（由 feed 索引统计或单独计数）。
- 编辑表单扩展：图标、隐藏、是否管理员专属。

#### 4.8 站点设置（Settings）
- 分组表单：基础信息 / 注册与登录 / 内容审核 / 公告。
- 公告提供前台预览；改动即时保存反馈。

### 5. 通用组件与视觉规范

| 组件 | 说明 |
|------|------|
| `AdminPage` | 统一页面容器（标题、说明、操作区、内容区） |
| `AdminTable` | 统一表格：列配置、排序、筛选、分页、行选择、空态/加载/错误态 |
| `AdminCard` | 统一卡片面板（ZZZ 三圆角 + 点阵纹理） |
| `AdminDrawer` | 右侧抽屉（详情/预览） |
| `StatusBadge` | 状态徽章统一色板（绿=正常/已发布、黄=待审、红=禁用/删除/已驳回、灰=草稿） |
| `RelativeTime` | 相对时间（刚刚/x 分钟前/x 天前） |
| `ConfirmButton` | 危险操作二次确认 |

视觉：底色沿用 `#0a0a0a/#1a1a1a`，主色 `--ik-primary`，面板 `24px 0 24px 24px` 圆角体系，与前台一致。

### 6. 交互与体验
- 全局搜索框（后台内检索用户/帖子）。
- 所有写操作统一 toast 反馈（成功/失败），危险操作 `ConfirmDialog` 确认。
- 路由守卫维持现状；按钮级权限（管理员/版主）逐步细化。
- 导出：用户/帖子列表导出 CSV（前端生成即可）。

### 7. 技术实现要点（在现有架构下）

- **沿用 Nuxt 4 + `useAdminApi`**：新增 `useAdminApi` 方法（`admin/reports`、`admin/stats/trend`、批量接口、`admin/posts/:id/preview` 可复用前台 detail）。
- **后端扩展点**：
  - `admin/stats` 增加 `trend`（近 30 天每日计数，后端从 feed/索引统计，避免前端遍历）。
  - `admin/reports` 列表/详情/处理（处理时联动删除目标内容）。
  - 帖子批量操作接口（可选）。
- **前端组件化**：抽出 `AdminTable/AdminDrawer/StatusBadge` 等通用件，页面只写业务逻辑。
- **趋势图**：自绘轻量折线/柱状，不引入 echarts 等大依赖（保持冷启动/体积可控）。

### 8. 分期实施建议

| 阶段 | 内容 | 目标 |
|------|------|------|
| P1 基础框架 | 通用组件（AdminTable/Card/Drawer/Badge）+ 布局重构 + 概览图表 | 页面统一、视觉对齐前台 |
| P2 审核与举报 | 待审核队列页 + 举报管理页（含后端接口） | 内容治理闭环 |
| P3 交互增强 | 帖子预览抽屉、批量操作、用户详情抽屉、CSV 导出 | 操作效率提升 |
| P4 打磨 | 全局搜索、权限细化、移动端适配、空态/错误态完善 | 完整可用 |
