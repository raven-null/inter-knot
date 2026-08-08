# 绳网论坛（InterKnot Forum）

一个可部署到 Netlify 的论坛网站：**前台用户论坛 + 后台管理端 + 前后端分离**。

- **前端**：Nuxt 4（Vue 3）+ Pinia + TanStack Vue Query，UI 复刻《绝区零》绳网风格（模板来自 [InterKnot-Web](https://github.com/yinengbei/InterKnot-Web)）。
- **后端**：Netlify Functions（v2 语法，`export default async (req, context) => {}`）。
- **存储**：全部使用 **Netlify Blobs**——结构化数据（用户/帖子/评论/点赞等）以 JSON 文档存于 `data` store，上传图片字节存于 `uploads` store；信息流用 `_indexes/feed.json` 索引文档，无需数据库与迁移。
- **图片**：上传时服务端用 sharp 自动转 WebP、限尺寸、剥 EXIF。
- **后台**：`/admin` 独立管理面板（数据概览 / 用户 / 版块 / 帖子 / 评论 / 设置），仅管理员可访问。

## 功能范围（首期）

| 模块 | 说明 |
|------|------|
| 前台-首页 | 帖子信息流（推荐/关注/收藏）、版块 Tab、搜索、无限滚动、虚拟瀑布流 |
| 前台-发帖 | 标题/正文（Markdown）、封面上传（自动转 WebP）、草稿箱、匿名发布 |
| 前台-帖子详情 | 正文渲染（DOMPurify 防 XSS）、楼中楼评论、点赞/收藏/三连、举报 |
| 前台-用户 | 注册（验证码）、登录、个人主页（名片/统计/帖子）、资料与头像 |
| 后台 | 数据统计、用户管理（禁用/角色）、帖子管理（审核/置顶/下架）、评论管理、版块管理、站点设置 |

## 目录结构

```
├─ app/                      # Nuxt 前端（srcDir）
│  ├─ pages/                 # 前台页面 + admin/ 后台页面
│  ├─ components/            # ZZZ 风格组件
│  ├─ composables/           # useApi（数据层）、useAdminApi（后台 API）
│  ├─ stores/                # Pinia auth
│  ├─ utils/                 # format-body / image / request-auth 等
│  └─ layouts/admin.vue      # 后台布局（含权限守卫）
├─ netlify/
│  ├─ functions/             # 后端（Netlify Functions）
│  │  ├─ api.ts              # 单入口 catch-all 路由 /api/*
│  │  └─ _lib/               # storage(auth,feed) / serialize / routes
│  └─ (无 database 目录)      # 存储全部走 Netlify Blobs，无需迁移
├─ zzzui/                    # 本地 zenless-ui 组件库
├─ netlify.toml              # 部署配置
└─ docs/ai设计建议.md         # 设计文档
```

## 本地开发

需要 Node ≥ 20.18，并安装 Netlify CLI：

```bash
npm install
npm install -g netlify-cli
cp .env.example .env        # 修改 JWT_SECRET、管理员账号
netlify dev                 # 同时启动 Nuxt 前端与 Functions + 本地 Postgres
```

> `netlify dev` 会为 Functions 自动连接本地数据库并应用迁移。若只想看前端 UI：
> `npm run dev`（此时 /api 请求无法响应）。

## 部署到 Netlify

1. 推到 GitHub 仓库。
2. Netlify → Add new site → Import an existing project → 选该仓库。
3. 构建配置（netlify.toml 已内置）：`command = npm run generate`，`publish = .output/public`，`functions = netlify/functions`。
4. 在 Site settings → Environment variables 配置 `JWT_SECRET`、`ADMIN_INITIAL_EMAIL`、`ADMIN_INITIAL_PASSWORD`。
5. 首次部署会自动创建数据库并执行迁移；用管理员账号登录后即可访问 `/admin`。

## 默认管理员

首次部署时按环境变量自动创建：`ADMIN_INITIAL_EMAIL`（默认 `admin@example.com`）/ `ADMIN_INITIAL_PASSWORD`（默认 `admin123456`）。

> 生产环境务必修改默认密码与 `JWT_SECRET`。
