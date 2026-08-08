# UI 适配与设计更新建议

> 目标：在**保持原有 ZZZ 风格与全部功能不变**的前提下，对项目 UI 进行系统性优化。
> 基于对全项目代码（pages / components / zzzui / styles / layouts）的深度分析。

---

## 一、现状分析

### 1.1 设计语言特征（已确立，需保留）

| 特征 | 现状 | 保留要求 |
|------|------|----------|
| 暗色主题 | `#0a0a0a` 底色 + `#1a1a1a` 抬高层 | 必须保留 |
| 主题绿 | `#BFFF09` 用于高亮/选中/主按钮 | 必须保留 |
| 三圆角面板 | `24px 0 24px 24px`（右上角直角） | 必须保留 |
| 棋盘/点阵纹理 | `chessboard-background` / `grid-pattern-background` | 必须保留 |
| 跑马灯背景 | `IkZzzMarquee` 全局固定背景 | 必须保留 |
| 自定义光标 | 18 种 cursor PNG 资源 | 必须保留 |
| 呼吸动画 | 激活态 tab/button 的 `z_ani_background` 颜色渐变 | 必须保留 |
| ZZZ 元素属性色 | ether(粉) / fire(橙) / electric(蓝) / ice(青) / physical(黄) | 必须保留 |

### 1.2 已发现的问题

| 类别 | 问题 | 影响范围 |
|------|------|----------|
| 响应式断点 | 768px / 1024px / 1100px / 1180px / 1200px / 1400px，断点散乱 | 全局 |
| CSS 变量 | `theme.css` 自定义变量与 `zzzui/var.scss` 变量并存，部分硬编码 | 全局 |
| 组件一致性 | 按钮/面板/输入框在不同页面样式不统一（admin vs 前台） | admin / create |
| 滚动条 | 桌面隐藏 + 移动端 `!important` 强制隐藏，部分组件有独立 scrollbar | theme.css |
| 图片加载 | `img:not(.ik-card__cover)` 全局 `opacity:0` 影响所有图片 | theme.css |
| 间距系统 | padding/margin 数值随意（8/10/12/14/16/20/24/32），无统一间距尺 | 全局 |
| 字体系统 | 全局 `font-family: sans-serif`，无指定字体栈 | theme.css |
| 焦点样式 | 仅 `z-button` 有 `:focus-visible`，其余交互元素缺失 | 可访问性 |

---

## 二、设计系统规范化

### 2.1 统一 CSS 变量体系

> 在 `theme.css` 的 `:root` 中补充间距、圆角、字体、阴影变量，与 zzzui 的 SCSS 变量形成互补。

```css
:root {
  /* ── 间距系统（8px 基准网格）── */
  --ik-space-xs: 4px;
  --ik-space-sm: 8px;
  --ik-space-md: 12px;
  --ik-space-lg: 16px;
  --ik-space-xl: 24px;
  --ik-space-2xl: 32px;
  --ik-space-3xl: 48px;

  /* ── 圆角系统（保持 ZZZ 三圆角风格）── */
  --ik-radius-sm: 6px;
  --ik-radius-md: 12px;
  --ik-radius-lg: 20px;
  --ik-radius-xl: 24px;
  --ik-radius-card: 24px 24px 0 24px;      /* 标准卡片 */
  --ik-radius-panel: 12px;                  /* 面板/容器 */
  --ik-radius-pill: 9999px;                 /* 胶囊按钮 */

  /* ── 字体系统 ── */
  --ik-font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, "Noto Sans SC", sans-serif;
  --ik-font-mono: "JetBrains Mono", "Fira Code", "SF Mono", Consolas, monospace;

  /* ── 字号系统 ── */
  --ik-text-xs: 11px;
  --ik-text-sm: 12px;
  --ik-text-base: 14px;
  --ik-text-md: 15px;
  --ik-text-lg: 17px;
  --ik-text-xl: 20px;
  --ik-text-2xl: 24px;
  --ik-text-3xl: 26px;

  /* ── 阴影系统 ── */
  --ik-shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.3);
  --ik-shadow-md: 0 6px 20px rgba(0, 0, 0, 0.45);
  --ik-shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.55);
  --ik-shadow-glow: 0 0 8px rgba(191, 255, 9, 0.4);

  /* ── 过渡 ── */
  --ik-duration-fast: 120ms;
  --ik-duration-normal: 200ms;
  --ik-duration-slow: 300ms;
  --ik-ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --ik-ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
}
```

### 2.2 字体栈修正

当前 `font-family: sans-serif` 导致不同平台渲染差异大。建议：

```css
html, body, #__nuxt {
  font-family: var(--ik-font-sans);
}
```

代码块/等宽场景使用 `var(--ik-font-mono)`。

### 2.3 间距统一

替换散乱的硬编码间距值为变量引用：

| 当前值 | 替换为 | 使用场景 |
|--------|--------|----------|
| `4px` | `var(--ik-space-xs)` | 微间距 |
| `8px` | `var(--ik-space-sm)` | 紧凑间距 |
| `10px` / `12px` | `var(--ik-space-md)` | 默认间距 |
| `14px` / `16px` | `var(--ik-space-lg)` | 内边距 |
| `20px` / `24px` | `var(--ik-space-xl)` | 区块间距 |
| `32px` | `var(--ik-space-2xl)` | 大区块间距 |

---

## 三、响应式断点统一

### 3.1 问题

当前断点散落在 5+ 个值：

```
768px   — 移动端（全局、首页、header、create、admin）
1024px  — 弹窗降级（theme.css）
1100px  — header tabs 隐藏（AppHeader.vue）
1180px  — 搜索框/品牌缩小（AppHeader.vue）
1200px  — create 页三栏（create.vue）
1400px  — 首页容器宽度（index.vue）
```

### 3.2 建议统一为 4 档

```css
/* 移动端: ≤ 768px */
/* 平板: 769px ~ 1024px */
/* 小桌面: 1025px ~ 1280px */
/* 大桌面: ≥ 1281px */
```

统一写法（在 `theme.css` 补充）：

```css
/* 移动端 */
@media (max-width: 768px) { /* ... */ }

/* 平板及以下 */
@media (max-width: 1024px) { /* ... */ }

/* 中屏 */
@media (max-width: 1280px) { /* ... */ }
```

各组件逐步迁移断点值到这 4 档，避免出现 `1100px`、`1180px`、`1400px` 等中间值。

---

## 四、组件统一化

### 4.1 按钮系统

当前按钮存在 3 种样式来源：
- `zzzui` 的 `.z-button`（主要前台）
- admin 页面的原生 `<button>` + 自定义 CSS
- create 页面的 `.ik-create-action` 系列

**建议**：统一使用 `zzzui` 的 `.z-button`，admin 页面逐步替换原生按钮。对 admin 专有按钮，通过 CSS 变量覆盖 zzzui 默认色：

```css
.ik-admin .z-button--default {
  background: #1a1a1a;
  border-color: #333;
}
```

### 4.2 面板/卡片系统

统一面板组件 `ik-panel` 的使用：

```css
.ik-panel {
  padding: var(--ik-space-lg);
  border-radius: var(--ik-radius-md);
  border: 1px solid #2d2d2d;
  background: linear-gradient(180deg, #212121 0%, #181818 100%);
}
```

admin 页面的 `AdminCard` 统一继承此基础样式，再叠加 admin 专属变量。

### 4.3 输入框系统

当前输入框有 3 种风格：
- `zzzui` 的 `.z-input`（圆角胶囊 + 右侧描边）
- admin 表格搜索的原生 `<input>`
- create 编辑器的 `<textarea>`

建议 admin 搜索框统一使用 `.z-input`，保持描边/聚焦动画一致。

### 4.4 状态徽章

建立统一的 `StatusBadge` 规范（admin 已有 `AdminBadge`，需扩展到前台）：

```css
.ik-badge { /* 基础 */ }
.ik-badge--success { background: rgba(0, 204, 13, 0.15); color: #00cc0d; }
.ik-badge--warning { background: rgba(255, 195, 0, 0.15); color: #ffc300; }
.ik-badge--danger  { background: rgba(192, 28, 0, 0.15); color: #ff4d4f; }
.ik-badge--info    { background: rgba(204, 204, 204, 0.15); color: #ccc; }
```

---

## 五、AppHeader 优化

### 5.1 问题

- 等级进度条在桌面端占据 header 左侧，但 `@media (max-width: 1100px)` 直接隐藏，无过渡
- 品牌 Logo 与等级条在登录/未登录态切换时有布局跳动
- 移动端 header 内边距 `6px 16px` 与桌面 `8px 32px` 差异大

### 5.2 建议

1. **等级条渐进隐藏**：在 1024px~1280px 区间，等级条折叠为仅显示头像 + 等级数字（隐藏进度条），1280px+ 完整显示
2. **Logo 与等级条过渡**：使用 `opacity` + `width` 过渡，避免 `display:none` 切换造成的跳动
3. **移动端 header**：统一内边距为 `var(--ik-space-sm) var(--ik-space-lg)`

---

## 六、首页瀑布流优化

### 6.1 问题

- 分类标签栏在桌面端 `flex-wrap: wrap`，标签多时换行后与搜索框重叠风险
- 瀑布流列宽断点：`<480px: 156, <768px: 200, <1200px: 220, else: 240`，断点与全局不一致
- 刷新 FAB 按钮在 `<768px` 隐藏，但 `<1100px` 还需上移避开 MobileBottomNav

### 6.2 建议

1. **分类标签**：桌面端保持 `flex-wrap: wrap`，移动端保持 `overflow-x: auto`；统一断点为 768px
2. **瀑布流列宽**：对齐全局断点：`<480: 156, <768: 200, <1024: 220, else: 240`
3. **FAB 定位**：统一为 `<768px` 隐藏，`768px~1024px` 上移避让，`>1024px` 常规定位

---

## 七、PostOverlay 弹窗优化

### 7.1 问题

- 弹窗入场/离场动画 200ms，但评论列表延迟 300ms 才渲染，中间有 100ms 空白
- 移动端弹窗全屏，但底部操作栏与系统手势区域冲突（`env(safe-area-inset-bottom)` 部分使用）
- 图片浏览器（lightGallery）z-index 固定 `10000/10001`，与 zzzui 的 `z-modal: 999` 无协调

### 7.2 建议

1. **评论渲染时机**：入场动画改为 200ms，评论列表延迟改为 250ms（减少空白间隙）
2. **安全区域**：底部操作栏统一添加 `padding-bottom: env(safe-area-inset-bottom, 0px)`
3. **z-index 管理**：建立 z-index 层级表：

```css
:root {
  --ik-z-marquee: -9999;
  --ik-z-header: 50;
  --ik-z-dropdown: 100;
  --ik-z-overlay: 9000;
  --ik-z-dialog: 9001;
  --ik-z-toast: 9999;
  --ik-z-gallery: 10000;
  --ik-z-gallery-outer: 10001;
}
```

---

## 八、create 发布页优化

### 8.1 问题

- 左栏草稿列表使用 `zzzui` 的 `z-menu`，但 `.z-menu__content` 与父容器尺寸不一致（已修复溢出，但建议进一步约束）
- 编辑器正文区 `<textarea>` 的 `min-height` 在不同屏幕下差异大，无平滑过渡
- 移动端底部操作栏固定定位，但键盘弹出时被遮挡

### 8.2 建议

1. **草稿列表**：`.z-menu__item` 统一 `min-height: 56px`，删除按钮使用 `visibility` 控制（已修复）
2. **编辑器高度**：使用 `min-height: clamp(300px, 50vh, 600px)` 自适应
3. **移动端键盘**：使用 `useVisualViewport()` composable（已有）动态调整底部栏位置

---

## 九、admin 后台优化

### 9.1 问题

- 侧边栏固定 `220px`，中屏（1024px）时内容区被压缩
- 表格无横向滚动容器，窄屏下内容溢出
- 顶部导航栏 `backdrop-filter: blur(8px)` 但无降级方案

### 9.2 建议

1. **侧边栏**：`1024px` 以下折叠为图标模式（`width: 64px`），悬停展开
2. **表格**：包裹 `.z-scrollbar` 或 `overflow-x: auto` 容器
3. **毛玻璃降级**：复用 `html.no-gpu` 降级策略

---

## 十、可访问性增强

### 10.1 焦点样式

当前仅 `.z-button:focus-visible` 有样式。建议全局补充：

```css
:focus-visible {
  outline: 2px solid rgba(191, 255, 9, 0.6);
  outline-offset: 2px;
}

/* 已有的 :focus:not(:focus-visible) 保持不变 */
```

### 10.2 跳过链接

在 `<body>` 开头添加跳过导航链接：

```html
<a href="#main-content" class="ik-skip-link">跳到主要内容</a>
```

```css
.ik-skip-link {
  position: absolute;
  left: -9999px;
  top: 0;
  z-index: 99999;
  padding: 8px 16px;
  background: var(--ik-primary);
  color: #000;
  font-weight: 700;
}
.ik-skip-link:focus {
  left: 0;
}
```

### 10.3 图片 alt 属性

全局图片加载过渡规则 `img:not(.ik-card__cover)` 影响所有图片。建议缩小范围：

```css
/* 仅对帖子卡片封面外的内容图片应用淡入 */
.ik-post-content img:not(.ik-card__cover) {
  opacity: 0;
  transition: opacity 280ms ease;
}
```

---

## 十一、性能相关的 UI 优化

### 11.1 动画性能

- 所有 `transform` / `opacity` 动画已使用 `will-change`（正确）
- `backdrop-filter` 已有 `html.no-gpu` 降级（正确）
- 建议对 `contain: layout style paint` 的使用扩展到更多静态容器

### 11.2 滚动性能

- 瀑布流 `VirtualMasonry` 已虚拟化（正确）
- 建议移动端全局滚动容器统一使用 `-webkit-overflow-scrolling: touch`（已废弃，但 iOS 仍有收益）

### 11.3 字体加载

- 当前无自定义字体，`sans-serif` 无加载开销
- 如后续引入自定义字体，使用 `font-display: swap` 避免 FOIT

---

## 十二、视觉细节打磨

### 12.1 卡片封面 hover 过渡

当前 `--ik-cover-scale` 从 `1` 到 `1.06`，过渡 `1.2s`。建议：

- 无 GPU 设备已降级为 `transition: none`（正确）
- 建议增加 `backface-visibility: hidden` 到 `.ik-card__cover`（已存在，正确）

### 12.2 滚动条美化

桌面端完全隐藏滚动条，但部分组件（如评论列表、mention picker）使用 `scrollbar-width: thin`。建议统一：

```css
/* 桌面端细滚动条（仅对可滚动内容区） */
@media (min-width: 769px) {
  .ik-scrollable {
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.18) transparent;
  }
  .ik-scrollable::-webkit-scrollbar {
    width: 4px;
  }
  .ik-scrollable::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.18);
    border-radius: 2px;
  }
}
```

### 12.3 暗色主题下的输入框

当前输入框背景 `#1c1c1c`，描边 `#323232`。在纯黑背景 `#0a0a0a` 下对比度偏低。建议：

- 输入框背景提亮到 `#1e1e1e`（已部分使用）
- 描边保持 `#323232`，聚焦态描边使用主题绿半透明

### 12.4 选中文本颜色

```css
::selection {
  background: rgba(191, 255, 9, 0.3);
  color: #fff;
}
```

---

## 十三、移动端专项优化

### 13.1 底部安全区域

`MobileBottomNav` 已使用 `env(safe-area-inset-bottom)`，但以下组件缺失：

- create 页底部操作栏
- PostOverlay 底部评论输入框
- KnockKnockModal 底部输入框

建议统一添加。

### 13.2 触摸目标尺寸

Apple HIG 建议最小触摸目标 44px。当前部分元素不足：

| 元素 | 当前尺寸 | 建议 |
|------|----------|------|
| 分类标签 | `height: 28px` | 保持（已足够宽） |
| 草稿删除按钮 | `24px` | 保持（绝对定位，点击区域已扩大） |
| header tab | `height: 42px` | 保持 |
| 搜索清除按钮 | `26px` | 扩大到 `28px`（已修正） |

### 13.3 长按菜单

帖子卡片在移动端长按时应阻止系统默认菜单（已通过 `@click.capture` 处理点击，但长按未覆盖）：

```css
.ik-card {
  -webkit-touch-callout: none;
}
```

---

## 十四、实施建议

### 14.1 分期计划

| 阶段 | 内容 | 预估工时 |
|------|------|----------|
| **P1 基础** | CSS 变量体系 + 字体栈 + 间距统一 + 断点统一 | 1-2 天 |
| **P2 组件** | 按钮/面板/输入框/徽章统一 + z-index 管理表 | 2-3 天 |
| **P3 响应式** | Header 渐进隐藏 + 首页断点对齐 + admin 侧边栏折叠 | 2-3 天 |
| **P4 可访问性** | 焦点样式 + 跳过链接 + 图片加载范围收窄 + 安全区 | 1 天 |
| **P5 打磨** | 选中文本色 + 滚动条统一 + 触摸目标 + 长按禁止 | 1 天 |

### 14.2 验证方式

每阶段完成后：

1. `npm run generate` 确保构建通过
2. `netlify dev` 本地验证所有页面
3. Chrome DevTools 响应式模式测试 360px / 768px / 1024px / 1280px / 1440px 五档
4. Lighthouse 跑分对比（Performance / Accessibility）

### 14.3 不做的事

| 不做 | 原因 |
|------|------|
| 引入 Tailwind / UnoCSS | 项目已有完整的 zzzui + scoped CSS 体系，引入原子化 CSS 会造成大量重复 |
| 引入 echarts / chart.js | admin 趋势图用自绘 SVG/Canvas，保持轻量 |
| 更换字体到 Inter / Noto Sans SC | 当前 `sans-serif` 已覆盖系统字体，加载零开销 |
| 暗色/亮色主题切换 | 项目定位为 ZZZ 风格暗色社区，无需亮色模式 |
| 重构 zzzui 组件库 | zzzui 组件功能完整，只需在应用层覆盖样式 |

---

## 十五、发布页面重新设计

> 现状：`/create` 页面约 3650 行，包含桌面双栏布局 + 移动端独立 Flutter 风格编辑器两套完全不同的 UI，维护成本高、体验不一致。

### 1. 现状分析

**桌面端（>768px）**：`grid: 230px + 1fr`
- 左栏：`z-menu` 草稿列表（标题+摘要），底部加载更多
- 右栏：标题 → 正文编辑器（编辑/预览 + MD 工具栏）→ 标签选择 → 媒体网格
- 固定底栏：保存状态 + 匿名开关 + 删除/发布按钮

**移动端（≤768px）**：完全独立的 Flutter 风格扁平编辑器
- 封面横滑条 → 标题 → 正文 → 设置行（分类/封面/帖子设置）
- 固定底栏：草稿按钮 + 发布按钮
- 底部弹层：草稿箱 / 设置 / 分类选择

### 2. 现有问题

| 类别 | 问题 |
|------|------|
| 布局 | 左栏 230px 固定宽度，草稿项 `is-active`/`is-bold` 状态溢出父容器 |
| 布局 | 右栏所有内容纵向堆叠，正文编辑区被压缩，需要大量滚动 |
| 布局 | 底栏固定 78px，与 header 同高，编辑区实际可用高度 = `100vh - 78 - 78` |
| 编辑器 | MD 工具栏只有 6 个按钮（加粗/斜体/链接/引用/代码/列表），缺少图片插入/标题/分割线 |
| 编辑器 | 编辑/预览切换后光标丢失，预览区样式与前台详情页不完全一致 |
| 移动端 | 完全独立的 HTML+CSS，与桌面端无共用，维护成本翻倍 |
| 移动端 | 封面横滑条 90px 缩略图太小，无法看清图片内容 |
| 交互 | 标签选择超过 6 个时用「全部」下拉，但下拉菜单样式与 z-dropdown 不一致 |
| 交互 | 媒体网格中图片和视频入口互斥（有图片时禁用视频，反之），但无视觉提示 |
| 状态 | 自动保存状态仅显示在底栏左侧，编辑过程中不易注意到 |

### 3. 重新设计目标

| 目标 | 说明 |
|------|------|
| 统一架构 | 桌面/移动端共用一套 HTML，仅通过 CSS 响应式切换布局 |
| 聚焦写作 | 编辑器占据主视觉区域，设置项不干扰写作流 |
| 状态可见 | 保存状态/字数/审核提示在编辑器内就近显示 |
| 全端自适应 | 桌面三栏 → 平板两栏 → 手机单栏，断点平滑过渡 |

### 4. 新布局设计

#### 4.1 桌面端（≥1024px）：三栏布局

```
┌──────────────────────────────────────────────────────────────┐
│  Header (78px)                                                │
├────────┬──────────────────────────────────┬──────────────────┤
│ 左栏   │  中栏（编辑器）                   │  右栏（设置）     │
│ 200px  │  flex: 1                         │  260px           │
│        │                                  │                  │
│ ▶编辑  │  ┌──────────────────────────┐    │  标签             │
│ 草稿1  │  │ 标题输入                  │    │  ○综合 ○技术 ... │
│ 草稿2  │  ├──────────────────────────┤    │                  │
│ 草稿3  │  │ MD工具栏                  │    │  封面             │
│ ...    │  │ [B][I][链接][引用][代码]   │    │  ┌──┐┌──┐┌──┐   │
│        │  │ [列表][图片][标题][分割线]  │    │  │封││  ││  │   │
│        │  ├──────────────────────────┤    │  └──┘└──┘└──┘   │
│        │  │                          │    │                  │
│        │  │ 正文编辑区                │    │  匿名发布         │
│        │  │ (可独立滚动)              │    │  [开关]           │
│        │  │                          │    │                  │
│        │  │                          │    │  ──────────────  │
│        │  ├──────────────────────────┤    │  保存状态         │
│        │  │ 字数: 123/5000  已保存    │    │  2分钟前自动保存  │
│        │  └──────────────────────────┘    │                  │
│        │                                  │  [删除草稿]       │
│        │                                  │  [发布帖子]       │
├────────┴──────────────────────────────────┴──────────────────┤
│  (无固定底栏，设置栏底部包含操作按钮)                          │
└──────────────────────────────────────────────────────────────┘
```

**关键变化**：
- **取消固定底栏**：操作按钮移入右栏底部，编辑区获得全部视口高度
- **左栏收窄为 200px**：仅显示草稿列表，不占过多空间
- **中栏专注编辑**：标题 + 工具栏 + 正文，单一任务流
- **右栏承载设置**：标签/封面/匿名/保存状态/操作按钮，与编辑解耦

#### 4.2 平板端（769px~1023px）：两栏布局

```
┌──────────────────────────────────────────────┐
│  Header                                      │
├──────────────────────────────┬───────────────┤
│  中栏（编辑器）               │  右栏（设置）  │
│  flex: 1                     │  240px        │
│                              │               │
│  标题 + 工具栏 + 正文        │  标签/封面/    │
│                              │  匿名/状态/   │
│                              │  操作按钮     │
├──────────────────────────────┴───────────────┤
│  移动端底栏（草稿按钮 + 发布按钮）            │
└──────────────────────────────────────────────┘
```

- 左栏隐藏，草稿列表移入移动端底栏的草稿弹层
- 右栏保留，但宽度收窄到 240px

#### 4.3 移动端（≤768px）：单栏布局

```
┌────────────────────────┐
│  Header                │
├────────────────────────┤
│  封面横滑条 (100px)     │
│  ┌──┐┌──┐┌──┐┌──┐     │
│  └──┘└──┘└──┘└──┘     │
├────────────────────────┤
│  标题输入               │
├────────────────────────┤
│  正文编辑区             │
│  (flex: 1, 可滚动)     │
│                        │
├────────────────────────┤
│  设置行                 │
│  分类  >               │
│  封面  >               │
│  帖子设置 >            │
├────────────────────────┤
│  [草稿] [发布]         │
└────────────────────────┘
```

- **与现有移动端布局基本一致**，但封面缩略图从 90px 增大到 100px
- 设置行保持底部弹层交互
- 草稿箱保持底部弹层交互

### 5. 编辑器增强

#### 5.1 Markdown 工具栏扩展

现有 6 个按钮 → 扩展为 9 个：

| 按钮 | 功能 | 快捷键 |
|------|------|--------|
| **B** | 加粗 | Ctrl+B |
| *I* | 斜体 | Ctrl+I |
| 链接 | 插入链接 | Ctrl+K |
| 引用 | 插入引用块 | — |
| `</>` | 行内代码 | — |
| 列表 | 无序列表 | — |
| `#` | 标题 (h2/h3) | — |
| `—` | 分割线 | — |
| 图片 | 插入图片（触发上传） | — |

工具栏分两组：格式组（B/I/链接/引用/代码/列表）+ 插入组（标题/分割线/图片），中间用竖线分隔。

#### 5.2 编辑/预览切换优化

- 切换到预览时记住滚动位置，切回时恢复
- 预览区样式与 `PostOverlay` 的 `.ik-post-body` 完全一致（复用 `useRenderedBody`）
- 预览区添加 `ik-scrollable` 类名，使用统一细滚动条

#### 5.3 字数与保存状态

- 字数显示移入编辑器右下角（浮动指示器），超限时变红
- 保存状态移入编辑器左下角（浮动指示器），显示「保存中… / 已保存 HH:mm / 未保存」
- 两个指示器使用 `position: sticky; bottom: 0` 粘在编辑区底部

### 6. 右栏设置面板

#### 6.1 标签选择

- 标签数量 ≤8 时直接平铺胶囊按钮
- 标签数量 >8 时，前 7 个平铺 + 第 8 个位置改为「更多▾」下拉
- 下拉使用 `z-dropdown` 组件，样式统一

#### 6.2 封面管理

- 封面网格改为 2 列（桌面右栏 260px 内），每张缩略图更大更清晰
- 第一张自动标注「封面」角标
- 拖拽排序保留
- 添加按钮改为文字按钮「+ 添加图片」/「+ 添加视频」，不再用独立的 `CoverImageAddButton`/`CoverVideoAddButton` 组件

#### 6.3 操作区

- 匿名开关 + 保存状态 + 删除/发布按钮集中在右栏底部
- 发布按钮使用 `position: sticky; bottom: 0` 固定在右栏底部
- 按钮文案：「保存草稿」（secondary）+「发布帖子」（primary）

### 7. 统一桌面/移动端 HTML

核心思路：**同一套模板，通过 CSS 控制显隐和布局**

```html
<template>
  <section class="ik-create-page">
    <!-- 左栏：桌面 ≥1024px 显示 -->
    <aside class="ik-create-sidebar">...</aside>

    <!-- 中栏：编辑器（始终显示） -->
    <main class="ik-create-editor">
      <封面横滑条 class="ik-create-covers" />
      <标题输入 />
      <工具栏 />
      <正文编辑区 />
      <字数指示器 />
    </main>

    <!-- 右栏：桌面 ≥769px 显示 -->
    <aside class="ik-create-settings">
      <标签选择 />
      <封面管理 />
      <匿名开关 />
      <保存状态 />
      <操作按钮 />
    </aside>

    <!-- 移动端底栏：≤1023px 显示 -->
    <footer class="ik-create-mobile-bar">
      <草稿按钮 />
      <发布按钮 />
    </footer>

    <!-- 移动端弹层（草稿/设置/分类） -->
    <Teleport>...</Teleport>
  </section>
</template>
```

```css
.ik-create-page {
  display: grid;
  grid-template-columns: 200px 1fr 260px;
}

/* 平板：隐藏左栏 */
@media (max-width: 1023px) {
  .ik-create-sidebar { display: none; }
  .ik-create-page { grid-template-columns: 1fr 240px; }
}

/* 移动端：单栏 */
@media (max-width: 768px) {
  .ik-create-page { grid-template-columns: 1fr; }
  .ik-create-settings { display: none; }
  .ik-create-mobile-bar { display: flex; }
}
```

### 8. 交互反馈

| 场景 | 反馈 |
|------|------|
| 自动保存中 | 编辑器左下角显示「保存中…」+ 旋转图标 |
| 自动保存完成 | 编辑器左下角显示「已保存 14:32」，2 秒后淡出 |
| 字数超限 | 字数指示器变红 + 底部出现红色警告条 |
| 发布成功 | toast「发布成功」+ 跳转首页（审核模式提示「已提交审核」） |
| 删除草稿 | `ConfirmDialog` 二次确认 |
| 拖拽上传 | 全屏遮罩「释放以上传图片」 |

### 9. 技术实现要点

| 要点 | 说明 |
|------|------|
| 模板统一 | 删除移动端独立 HTML（`ik-create-mobile`），桌面/移动共用一套 |
| CSS 响应式 | 用 `grid-template-columns` + `@media` 切换布局，不用 `display:none` 切换两套 UI |
| 组件拆分 | `CreateSidebar` / `CreateEditor` / `CreateSettings` / `CreateMobileBar`，页面只做组合 |
| 编辑器 | 沿用 `ZTextarea` + MD 工具栏，预览复用 `useRenderedBody` |
| 封面管理 | 沿用现有上传/拖拽/预览逻辑，仅调整布局 |
| 草稿列表 | 桌面左栏用 `z-menu`，移动端用底部弹层（保留现有交互） |

### 10. 分期实施

| 阶段 | 内容 | 目标 |
|------|------|------|
| **P1** | 模板统一：删除移动端独立 HTML，桌面/移动共用一套模板 + CSS 响应式切换 | 消除重复代码 |
| **P2** | 三栏布局：左栏(草稿) + 中栏(编辑器) + 右栏(设置)，取消固定底栏 | 桌面布局优化 |
| **P3** | 编辑器增强：工具栏扩展 + 字数/保存状态浮动指示器 + 预览样式对齐 | 写作体验提升 |
| **P4** | 右栏优化：标签选择改用 z-dropdown + 封面网格 2 列 + 操作按钮 sticky | 设置区体验 |

---

## 十七、米哈游（米游社）账号绑定实现方案

> 现状：前端「账号中心 → 米哈游账号」已有完整的扫码绑定 UI 与轮询逻辑（`useMihoyoQr` / `useAccountData` / `account.vue`），`useApi` 也定义了完整的接口契约；但后端 4 个端点（`/api/auth/mihoyo/qr`、`/qr/status`、`/binding` GET/DELETE）目前都是**桩**（返回 501 / 空值），绑定并未真正实现。

### 1. 现状梳理（前端契约即后端要实现的目标）

| 前端调用 | 方法 | 期望返回 |
|----------|------|----------|
| `createMihoyoQr()` → `POST /api/auth/mihoyo/qr` | 创建扫码会话 | `{ qrUrl, ticket, expiresIn, mode: "login"\|"bind" }` |
| `pollMihoyoQr(ticket)` → `POST /api/auth/mihoyo/qr/status` | 轮询扫码状态 | `{ status: "waiting"\|"scanned"\|"confirmed"\|"expired"\|"cancelled" }`；confirmed 时 `{ mode, binding }`；login 模式还要 `{ jwt, user, isNewUser }` |
| `getMihoyoBinding()` → `GET /api/auth/mihoyo/binding` | 查绑定（带 token） | `{ binding: MihoyoBinding \| null }` |
| `unbindMihoyo()` → `DELETE /api/auth/mihoyo/binding` | 解绑 | `{ success: true }` |

`MihoyoBinding`（见 `types/entities.ts`）字段：`aid`、`zzzUid`、`zzzNickname`、`zzzLevel`、`zzzRegion`、`zzzRegionName`、`lastSyncedAt`。

### 2. 米游社扫码登录的官方流程（需对接 passport-api）

社区逆向出的流程（以 `passport-api.mihoyo.com` 为例，`zzz_cn` 为《绝区零》游戏标识）：

```
① 创建二维码
   GET https://passport-api.mihoyo.com/account/auth/api/createQRLogin
      ?app_id=...&app_key=...&auth_app_id=...&app_name=...&auth_key_ver=...
   headers（私有请求头，必需）:
     x-rpc-client_type, x-rpc-app_id, x-rpc-app_key, x-rpc-device_id,
     x-rpc-device_name, x-rpc-device_model, x-rpc-sdk_version, x-rpc-aigis,
     x-rpc-verify_key, Origin, User-Agent, Referer ...
   返回 → { url（二维码内容）, ticket, expire }

② 轮询扫码状态
   GET https://passport-api.mihoyo.com/account/auth/api/queryQRLogin
      ?app_id=...&ticket=...
   status: WAIT_SCAN / WAIT_CONFIRM / CONFIRMED / EXPIRED / CANCELLED
   CONFIRMED 时返回 { uid, token }（token 为 stoken，需立即兑换为 cookie）

③ 用 stoken 换 cookie
   GET https://passport-api.mihoyo.com/account/auth/api/getCookieAccountInfoBySToken
      ?stoken=...&uid=...
   返回 { mid, cookie_token, account_id }

④ 拉取绝区零角色（绑定信息）
   GET https://api-takumi.mihoyo.com/binding/api/getUserGameRolesByCookie
      ?game_biz=zzz_cn    headers: Cookie
   返回 { list: [{ game_biz, uid, region, nickname, level, region_name }] }
```

**关键点**：第①、②步的 `x-rpc-*` 私有请求头是官方 Web/App 客户端下发的，社区逆向维护，**属于非公开接口**；米游社服务条款明确禁止未经授权的自动化调用。是否接入需要自行评估合规与封号风险（`docs/更新日志.md` 已注明“违反其服务条款”）。

### 3. 后端落地建议（Blobs 存储设计）

建议新建 `netlify/functions/_lib/routes/mihoyo.ts`，替换 `stubs.ts` 中的 4 个桩，并保留 `isApiThrow` 错误兜底。

**存储（data store）**：

```ts
// 扫码会话：key = mihoyo/qr-sessions/{ticket}.json
{ ticket, qrUrl, mode: "login" | "bind",
  createdAt, expiresAt, status: "waiting"|"scanned"|"confirmed"|"expired"|"cancelled",
  uid?, token?, aid?, lastPolledAt }

// 用户绑定：key = mihoyo/bindings/{userId}.json（或挂在用户文档上）
{ userId, aid, zzzUid, zzzNickname, zzzLevel, zzzRegion, zzzRegionName, boundAt, lastSyncedAt }

// 反查索引（登录模式用）：key = mihoyo/by-aid/{aid}.json → { userId }
```

**接口实现要点**：

| 端点 | 逻辑 |
|------|------|
| `POST /api/auth/mihoyo/qr` | 若带有效 token → `mode:"bind"`；否则 `mode:"login"`。调用 passport `createQRLogin`，把 `{ qrUrl, ticket, expiresIn, mode }` 落库并返回。 |
| `POST /api/auth/mihoyo/qr/status` | 读 ticket 会话，调 passport `queryQRLogin` 更新状态。`CONFIRMED` 时：① stoken 换 cookie → ② 拉取 zzz 角色 → ③ `bind` 模式写入 `bindings/{userId}`；`login` 模式查 `by-aid` 反查用户并签发本站 JWT（无则建号，见下文）。 |
| `GET /api/auth/mihoyo/binding` | 读 `bindings/{userId}`，按需刷新角色数据（含 `lastSyncedAt`）。 |
| `DELETE /api/auth/mihoyo/binding` | 删除 `bindings/{userId}` 与 `by-aid/{aid}` 索引。 |

**login 模式建号**：以 `mid/account_id` 作为外部唯一标识存 `users/by-mihoyo/{aid}.json → { userId }`；首次登录自动建用户（`uid` 用现有 `userUidKey` 分配），与 GitHub OAuth（`users/by-github/<id>`）完全对称。

**配置**：app_id / app_key 等私有参数放环境变量（`.env` 已忽略，不写代码），服务端可缓存 cookie 减少 ③④ 调用。

### 4. 前端配合（基本已完成）

- 账号中心扫码绑定 UI、二维码渲染（`qrcode` 库）、`useMihoyoQr` 轮询与过期刷新：**已实现**。
- 登录弹窗的米游社按钮（`LoginDialog`）：目前未调用 `createMihoyoQr`，需接 login 模式；绑定入口在账号中心。
- 绑定成功后 `account.vue` 通过 `setMihoyoBinding` 更新状态、profile 页 `zzz` 徽章展示：**已实现**。

### 5. 风险与合规

| 项 | 说明 |
|----|------|
| 违反 ToS | 私有请求头逆向调用可能违反米游社服务条款，存在账号风控/封禁风险 |
| 接口变动 | `x-rpc-*` 参数、app_id、签名算法（`x-rpc-verify_key`/aigis）会随版本变化，需持续维护 |
| 反爬 | 高频轮询会被风控；建议限流（单 ticket 轮询 ≤1 次/1.5s，超时 3 分钟作废） |
| 替代方案 | 若仅需展示《绝区零》角色，可改为**手动填写 UID/区服**（零合规风险）；或对接 B 站/其他合规第三方 OAuth |

### 6. 分期实施

| 阶段 | 内容 |
|------|------|
| **P1 绑定** | 实现 `qr` / `qr/status`（bind 模式）+ `binding` GET/DELETE，打通账号中心扫码绑定 |
| **P2 登录** | `qr` 支持 login 模式 + `by-aid` 反查/建号 + 签发 JWT，接登录弹窗 |
| **P3 加固** | 会话过期/限流/错误退避、cookie 缓存、被动刷新角色数据、风控日志 |
| **P4 兜底** | 若 passport 接口失效，保留现有「手动绑定 UID」作为降级入口 |

---

## 十六、设计规范速查表

```
颜色
  背景:     #0a0a0a (base) / #1a1a1a (elevated) / #222222 (card)
  主题:     #BFFF09 (primary) / #00e5ff (accent)
  危险:     #ff4d4f
  文字:     #e8e8e8 (text) / #9a9a9a (muted)

圆角
  卡片:     24px 24px 0 24px
  面板:     12px
  按钮:     6px (default) / 9999px (pill)
  输入框:   9999px

间距
  xs: 4px / sm: 8px / md: 12px / lg: 16px / xl: 24px / 2xl: 32px

字号
  xs: 11px / sm: 12px / base: 14px / md: 15px / lg: 17px / xl: 20px / 2xl: 24px

断点
  mobile: ≤768px / tablet: ≤1024px / desktop: ≤1280px / wide: >1280px

动画
  fast: 120ms / normal: 200ms / slow: 300ms
  ease-out: cubic-bezier(0.22, 1, 0.36, 1)

z-index
  marquee: -9999 / header: 50 / dropdown: 100 / overlay: 9000 / toast: 9999 / gallery: 10000
```
