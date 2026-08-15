# 绳网论坛（InterKnot Forum）

一个可部署到 Netlify 的论坛网站，复刻《绝区零》绳网风格。

## 技术栈

| 层次 | 技术 |
|------|------|
| **前端** | Nuxt 4（Vue 3）+ Pinia + TanStack Vue Query |
| **UI 库** | 自研 zenless-ui（`zzzui/` 目录） |
| **后端** | Netlify Functions v2（单入口 `api.ts`） |
| **存储** | Netlify Blobs（结构化 JSON + 图片字节） |
| **图片处理** | sharp（服务端转 WebP、压缩、剥 EXIF） |

## 快速开始

### 环境要求

- Node.js ≥ 20.18
- npm
- Netlify CLI（本地开发需要）

### 安装

```bash
# 克隆仓库
git clone https://github.com/raven-null/inter-knot.git
cd inter-knot

# 安装依赖（存在 peer 冲突时使用 --legacy-peer-deps）
npm install --legacy-peer-deps

# 全局安装 Netlify CLI
npm install -g netlify-cli

# 复制环境变量
cp .env.example .env
```

### 环境变量

编辑 `.env` 文件，配置以下变量：

```env
JWT_SECRET=your-secret-key
ADMIN_INITIAL_EMAIL=admin@example.com
ADMIN_INITIAL_PASSWORD=admin123456
```

### 本地开发

```bash
# 启动完整开发环境（前端 + 后端 Functions）
netlify dev

# 仅启动前端（/api 请求无法响应）
npm run dev
```

> **注意**：本地联调请使用 `netlify dev`，不要用 `npm run dev`，否则 `/api` 无响应。

### 构建与部署

```bash
# 构建静态站点
npm run generate

# 预览构建结果
npx serve .output/public
```

## 部署到 Netlify

1. 推送代码到 GitHub 仓库。
2. Netlify → Add new site → Import an existing project → 选择仓库。
3. 构建配置（`netlify.toml` 已内置）：
   - Build command: `npm run generate`
   - Publish directory: `.output/public`
   - Functions directory: `netlify/functions`
4. 在 Site settings → Environment variables 配置：
   - `JWT_SECRET`：JWT 签名密钥
   - `ADMIN_INITIAL_EMAIL`：管理员邮箱
   - `ADMIN_INITIAL_PASSWORD`：管理员密码
   - `GLM_API_KEY`：**Fairy AI 对话密钥（必配）**——到 https://open.bigmodel.cn 重新生成新 key（仓库内置旧 key 已公开于 GitHub 历史、被智谱风控，数据中心 IP 会返回 401）；配置前可本地验证：`node scripts/verify-glm-key.mjs "<新key>"`
5. 首次部署会自动创建管理员账号。

## 默认管理员

首次部署时按环境变量自动创建：
- 邮箱：`ADMIN_INITIAL_EMAIL`（默认 `admin@example.com`）
- 密码：`ADMIN_INITIAL_PASSWORD`（默认 `admin123456`）

> 生产环境务必修改默认密码与 `JWT_SECRET`。

## 目录结构

```
inter-knot/
├── app/                          # Nuxt 前端源码（srcDir）
│   ├── pages/                    # 页面路由
│   │   ├── index.vue             # 首页（信息流）
│   │   ├── create.vue            # 发帖页
│   │   ├── post/[id].vue         # 帖子详情页
│   │   ├── profile/[id].vue      # 个人主页
│   │   ├── level.vue             # 等级体系页
│   │   ├── account.vue           # 账号中心
│   │   ├── knock.vue             # 敲敲（私信入口）
│   │   └── admin/                # 后台管理页面
│   │       ├── index.vue         # 数据概览
│   │       ├── users.vue         # 用户管理
│   │       ├── posts.vue         # 帖子管理
│   │       ├── comments.vue      # 评论管理
│   │       ├── reports.vue       # 举报管理
│   │       ├── categories.vue    # 版块管理
│   │       ├── forum.vue         # 导航与功能开关
│   │       └── settings.vue      # 站点设置
│   ├── components/               # Vue 组件（45+）
│   │   ├── KnockKnockModal.vue   # 敲敲弹窗（私信/群聊/AI）
│   │   ├── PostOverlay.vue       # 帖子弹窗（首页点击打开）
│   │   ├── DmMessageItem.vue     # 私聊消息气泡
│   │   ├── DmComposer.vue        # 私聊输入框
│   │   ├── CommentItem.vue       # 评论组件
│   │   ├── PostCard.vue          # 帖子卡片（信息流）
│   │   ├── UserHoverCard.vue     # 用户悬浮名片
│   │   ├── MentionPicker.vue     # @提及候选浮层
│   │   ├── EmotePicker.vue       # 表情选择面板
│   │   ├── BilibiliPlayer.vue    # B站视频播放器
│   │   └── ai/                   # AI 相关组件
│   ├── composables/              # 组合式函数（33+）
│   │   ├── useApi.ts             # 前端 API 层
│   │   ├── useAdminApi.ts        # 后台 API
│   │   ├── useDmConversations.ts # 私聊会话管理
│   │   ├── useLightGallery.ts    # 灯箱 composable
│   │   ├── useMentionInput.ts    # @提及输入逻辑
│   │   ├── useEmoteInsert.ts     # 表情插入逻辑
│   │   └── usePresence.ts        # 在线状态
│   ├── stores/                   # Pinia 状态管理
│   │   └── auth.ts               # 认证状态
│   ├── types/                    # TypeScript 类型定义
│   │   └── entities.ts           # 实体类型（Post/Comment/User 等）
│   ├── utils/                    # 工具函数
│   │   ├── image.ts              # 图片 URL 处理
│   │   ├── upload.ts             # 上传常量与压缩
│   │   ├── mention.ts            # Mention token 解析
│   │   └── dm-view.ts            # DM 消息视图工具
│   ├── layouts/                  # 布局组件
│   │   └── admin.vue             # 后台布局
│   ├── middleware/               # 路由中间件
│   ├── plugins/                  # Nuxt 插件
│   ├── assets/                   # 静态资源（样式等）
│   ├── app.vue                   # 根组件
│   └── error.vue                 # 错误页面
├── netlify/                      # Netlify 后端
│   └── functions/
│       ├── api.ts                # 单入口 catch-all 路由
│       └── _lib/                 # 后端库
│           ├── routes/           # API 路由
│           │   ├── auth.ts       # 认证路由
│           │   ├── articles.ts   # 帖子路由
│           │   ├── comments.ts   # 评论路由
│           │   ├── interactions.ts # 互动路由（点赞/收藏/关注）
│           │   ├── dm.ts         # 私信路由
│           │   ├── notifications.ts # 通知路由
│           │   ├── profiles.ts   # 用户资料路由
│           │   ├── uploads.ts    # 上传路由
│           │   ├── admin.ts      # 后台管理路由
│           │   ├── ai.ts         # AI 对话路由
│           │   └── emotes.ts     # 表情包路由
│           ├── auth.ts           # 认证工具
│           ├── storage.ts        # Netlify Blobs 存储层
│           ├── feed.ts           # 信息流索引
│           ├── notify.ts         # 通知系统
│           ├── serialize.ts      # 数据序列化
│           ├── http.ts           # HTTP 响应工具
│           └── glm.ts            # 智谱 GLM AI 调用
├── zzzui/                        # 自研 UI 组件库
├── public/                       # 静态资源
│   └── images/                   # 图片资源
├── docs/                         # 文档
│   ├── 更新日志.md                # 变更记录
│   ├── 功能文档.md                # 功能说明
│   └── ai设计建议.md              # AI 设计文档
├── netlify.toml                  # Netlify 部署配置
├── nuxt.config.ts                # Nuxt 配置
├── package.json                  # 项目依赖
├── tsconfig.json                 # TypeScript 配置
├── README.md                     # 项目说明
└── SECURITY.md                   # 安全说明
```

## 主要功能

### 前台

| 功能 | 说明 |
|------|------|
| 信息流 | 推荐/关注/收藏流，瀑布流虚拟列表，多图轮播 |
| 发帖 | Markdown 编辑器，多图上传，B站视频嵌入，草稿箱，匿名发布 |
| 帖子详情 | 正文渲染，楼中楼评论，点赞/收藏，图片灯箱 |
| 个人主页 | 名片横幅，统计，帖子列表，通知 Tab，关注/粉丝 |
| 敲敲（私信） | 私聊/群聊/AI 对话，图片消息，B站视频，UID搜索用户 |
| 通知系统 | 点赞/评论/@提及/关注通知，免打扰设置 |
| 等级体系 | 发帖/评论/获赞累积经验升级 |

### 后台

| 功能 | 说明 |
|------|------|
| 数据概览 | 用户/帖子/评论/浏览量统计，趋势图 |
| 用户管理 | 搜索/添加/禁用/删除用户，调整角色和等级 |
| 帖子管理 | 搜索/置顶/下架/删除帖子 |
| 评论管理 | 搜索/删除评论 |
| 举报管理 | 查看/处理举报 |
| 版块管理 | 新增/编辑/删除版块 |
| 站点设置 | 站点名称、公告、注册开关等 |

## API 端点

### 认证
- `POST /api/auth/login-by-key` - 密钥登录
- `POST /api/auth/renew` - 续期令牌

### 帖子
- `GET /api/articles/list` - 帖子列表
- `GET /api/articles/detail` - 帖子详情
- `POST /api/articles/triple` - 一键三连（点赞+收藏）

### 评论
- `GET /api/articles/:id/comments` - 评论列表
- `POST /api/articles/:id/comments` - 发表评论

### 互动
- `POST /api/interactions/like` - 点赞/取消点赞
- `POST /api/interactions/favorite` - 收藏/取消收藏
- `POST /api/interactions/follow` - 关注/取消关注
- `GET /api/authors/search` - 搜索用户

### 私信
- `GET /api/dm/conversations` - 会话列表
- `POST /api/dm/conversations/direct` - 创建私聊
- `POST /api/dm/conversations/group` - 创建群聊
- `POST /api/dm/conversations/:id/messages` - 发送消息

### 通知
- `GET /api/notifications` - 通知列表
- `POST /api/notifications/read-all` - 全部标记已读
- `GET /api/notifications/settings` - 获取免打扰设置
- `PATCH /api/notifications/settings` - 更新免打扰设置

### 上传
- `POST /api/uploads/sign` - 签名上传
- `PUT /api/direct-upload/raw/:key` - 上传文件

### 后台
- `GET /api/admin/stats` - 统计数据
- `GET /api/admin/users` - 用户列表
- `POST /api/admin/users` - 创建用户
- `PATCH /api/admin/users/:id` - 更新用户
- `DELETE /api/admin/users/:id` - 删除用户

## 更新日志

详见 [docs/更新日志.md](./docs/更新日志.md)

## 功能文档

详见 [docs/功能文档.md](./docs/功能文档.md)

## 许可证

[LICENSE](./LICENSE)
