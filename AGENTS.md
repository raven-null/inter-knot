# 项目开发约定（AGENTS）

本文件记录 AI 助手在本仓库工作时必须遵守的约定。

## 必做项

1. **每次推送前必须更新 `docs/更新日志.md`**：把本次变更按「新增 / 修复 / 变更 / 重构」分类补录到 `## [未发布]` 小节（格式参照 Keep a Changelog）。只有更新日志与代码一起提交推送，才算完成一次推送。

2. 提交信息使用简洁的中文，格式：
   - 新增功能：`feat: ...`
   - 修复：`fix: ...`
   - 重构：`refactor: ...`
   - 文档：`docs: ...`

3. 依赖安装使用 `npm install --legacy-peer-deps`（存在 peer 冲突）。

4. 修改后端 Netlify Functions 后，用以下命令验证：
   ```bash
   npx tsc --noEmit netlify/functions/api.ts --module ESNext --moduleResolution bundler --target ES2022 --skipLibCheck --esModuleInterop --resolveJsonModule --types node
   npx esbuild netlify/functions/api.ts --bundle --platform=node --format=esm --packages=external --outfile="%TEMP%\api-check.mjs"
   ```
   修改前端后验证：`npm run generate`。

5. 环境变量与密钥不写入代码、不提交（`.env` 已忽略）。

## 项目要点

- 前端 Nuxt 4（`srcDir: app/`），后端 Netlify Functions 单入口 `netlify/functions/api.ts`（v2 语法，`getStore()`/`getDatabase()` 必须在 handler 内部调用）。
- 存储全部使用 **Netlify Blobs**：结构化 JSON 文档存 `data` store，图片字节存 `uploads` store；信息流用 `_indexes/feed.json` 索引文档。
- 部署配置在 `netlify.toml`（构建 `npm run generate`，发布目录 `.output/public`）。
- 本地联调用 `netlify dev`（不要用 `npm run dev`，否则 `/api` 无响应）。
