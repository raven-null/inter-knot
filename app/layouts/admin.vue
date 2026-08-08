<script setup lang="ts">
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const ICONS = {
  dash: "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z",
  review: "M12 2l8 3v6c0 4.5-3.2 7.7-8 9-4.8-1.3-8-4.5-8-9V5l8-3zm-1 13l-3.5-3.5 1.4-1.4L11 12.2l4.1-4.1 1.4 1.4L11 15z",
  posts: "M4 4h16v4H4zM4 10h16v2H4zM4 14h16v2H4zM4 18h10v2H4z",
  comments: "M4 4h16a2 2 0 012 2v10a2 2 0 01-2 2H8l-5 5V6a2 2 0 012-2z",
  reports: "M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z",
  users: "M16 11a4 4 0 10-4-4 4 4 0 004 4zm-8 2a5 5 0 00-5 5v3h10v-3a5 5 0 00-5-5zm8 0a3 3 0 00-3 3v5h8v-5a3 3 0 00-3-3z",
  categories: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  settings: "M19.4 13a7.9 7.9 0 000-2l2-1.5-2-3.5-2.4 1a8 8 0 00-1.7-1L15 3h-4l-.3 2.4a8 8 0 00-1.7 1l-2.4-1-2 3.5L6.6 11a8 8 0 000 2l-2 1.5 2 3.5 2.4-1a8 8 0 001.7 1L11 21h4l.3-2.4a8 8 0 001.7-1l2.4 1 2-3.5-2-1.1z",
};

const navGroups = [
  { label: "概览", items: [{ to: "/admin", label: "数据概览", icon: ICONS.dash }] },
  {
    label: "内容管理",
    items: [
      { to: "/admin/review", label: "待审核", icon: ICONS.review },
      { to: "/admin/posts", label: "帖子管理", icon: ICONS.posts },
      { to: "/admin/comments", label: "评论管理", icon: ICONS.comments },
      { to: "/admin/reports", label: "举报管理", icon: ICONS.reports },
    ],
  },
  { label: "用户", items: [{ to: "/admin/users", label: "用户管理", icon: ICONS.users }] },
  {
    label: "系统",
    items: [
      { to: "/admin/categories", label: "版块管理", icon: ICONS.categories },
      { to: "/admin/forum", label: "论坛设置", icon: ICONS.settings },
      { to: "/admin/settings", label: "站点设置", icon: ICONS.settings },
    ],
  },
];

const allItems = navGroups.flatMap((g) => g.items);

const isActive = (to: string) => {
  if (to === "/admin") return route.path === "/admin";
  return route.path.startsWith(to);
};

const currentTitle = computed(
  () => allItems.find((i) => isActive(i.to))?.label || "后台管理",
);

onMounted(async () => {
  // 兜底校验：等待用户信息加载完成后判断管理员权限
  if (!auth.isLogin) {
    router.replace("/");
    return;
  }
  if (!auth.user) {
    try {
      await auth.fetchSelfUser();
    } catch {
      router.replace("/");
      return;
    }
  }
  if (!auth.user?.isAdmin) {
    router.replace("/");
  }
});
</script>

<template>
  <div class="ik-admin">
    <aside class="ik-admin__side">
      <div class="ik-admin__brand">
        <span class="ik-admin__brand-dot" />
        绳网后台
      </div>
      <nav class="ik-admin__nav">
        <div v-for="group in navGroups" :key="group.label" class="ik-admin__group">
          <div class="ik-admin__group-label">{{ group.label }}</div>
          <NuxtLink
            v-for="item in group.items"
            :key="item.to"
            :to="item.to"
            class="ik-admin__nav-item"
            :class="{ 'is-active': isActive(item.to) }"
          >
            <svg class="ik-admin__nav-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path :d="item.icon" fill="currentColor" />
            </svg>
            <span>{{ item.label }}</span>
          </NuxtLink>
        </div>
      </nav>
      <div class="ik-admin__side-footer">
        <NuxtLink to="/" class="ik-admin__back">← 返回前台</NuxtLink>
      </div>
    </aside>

    <main class="ik-admin__main">
      <header class="ik-admin__topbar">
        <h1 class="ik-admin__title">{{ currentTitle }}</h1>
        <span class="ik-admin__uid">管理员 · {{ auth.user?.name || auth.user?.username }}</span>
      </header>
      <div class="ik-admin__content">
        <slot />
      </div>
      <footer class="ik-admin__footer">
        <div class="ik-admin__footer-inner">
          <span class="ik-admin__footer-brand">
            <span class="ik-admin__footer-dot" />
            绳网后台
          </span>
          <span class="ik-admin__footer-links">
            <NuxtLink to="/" class="ik-admin__footer-link">返回前台</NuxtLink>
            <a
              href="https://github.com/raven-null/inter-knot/blob/main/docs/更新日志.md"
              target="_blank"
              rel="noopener"
              class="ik-admin__footer-link"
            >更新日志</a>
          </span>
          <span class="ik-admin__footer-copy">InterKnot Forum · © {{ new Date().getFullYear() }}</span>
        </div>
      </footer>
    </main>
  </div>
</template>

<style scoped>
.ik-admin {
  display: flex;
  min-height: calc(100vh - 60px);
  background: var(--ik-bg, #0a0a0a);
  color: var(--ik-text, #e8e8e8);
}

.ik-admin__side {
  width: 220px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: #101010;
  border-right: 1px solid #232323;
  position: sticky;
  top: 60px;
  height: calc(100vh - 60px);
}

.ik-admin__brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 18px 20px;
  font-weight: 900;
  letter-spacing: 0.04em;
  color: var(--ik-primary, #bfff09);
  border-bottom: 1px solid #1e1e1e;
}

.ik-admin__brand-dot {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  background: var(--ik-primary, #bfff09);
  box-shadow: 0 0 8px var(--ik-primary, #bfff09);
}

.ik-admin__nav {
  flex: 1;
  padding: 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
}

.ik-admin__group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ik-admin__group-label {
  padding: 4px 12px 2px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: #6a6a6a;
  text-transform: uppercase;
}

.ik-admin__nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  color: var(--ik-muted, #9a9a9a);
  text-decoration: none;
  font-size: 14px;
  transition: background 160ms, color 160ms;
}

.ik-admin__nav-item:hover {
  background: #1c1c1c;
  color: #fff;
}

.ik-admin__nav-item.is-active {
  background: rgba(191, 255, 9, 0.12);
  color: var(--ik-primary, #bfff09);
}

.ik-admin__nav-icon {
  width: 18px;
  height: 18px;
}

.ik-admin__side-footer {
  padding: 14px 20px;
  border-top: 1px solid #1e1e1e;
}

.ik-admin__back {
  color: var(--ik-muted, #9a9a9a);
  text-decoration: none;
  font-size: 13px;
}

.ik-admin__back:hover {
  color: var(--ik-primary, #bfff09);
}

.ik-admin__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.ik-admin__topbar {
  flex-shrink: 0;
  position: sticky;
  top: 60px;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 24px;
  background: rgba(10, 10, 10, 0.92);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid #1e1e1e;
}

.ik-admin__title {
  margin: 0;
  font-size: 17px;
  font-weight: 900;
  letter-spacing: 0.03em;
}

.ik-admin__uid {
  font-size: 13px;
  color: var(--ik-muted, #9a9a9a);
}

.ik-admin__content {
  flex: 1 1 auto;
  padding: 28px 32px 48px;
}

.ik-admin__footer {
  flex-shrink: 0;
  margin: 0 32px 28px;
  padding: 18px 24px;
  background: #141414;
  border: 1px solid #2a2a2a;
  border-radius: 12px 12px 0 12px;
}

.ik-admin__footer-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.ik-admin__footer-brand {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--ik-primary, #bfff09);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.ik-admin__footer-dot {
  width: 8px;
  height: 8px;
  border-radius: 3px;
  background: var(--ik-primary, #bfff09);
  box-shadow: 0 0 8px var(--ik-primary, #bfff09);
}

.ik-admin__footer-links {
  display: inline-flex;
  gap: 16px;
}

.ik-admin__footer-link {
  color: #a0a0a0;
  font-size: 12px;
  text-decoration: none;
}

.ik-admin__footer-link:hover {
  color: var(--ik-primary, #bfff09);
}

.ik-admin__footer-copy {
  color: #8a8a8a;
  font-size: 12px;
}

@media (max-width: 768px) {
  .ik-admin {
    flex-direction: column;
  }
  .ik-admin__side {
    width: 100%;
    height: auto;
    position: static;
    flex-direction: row;
    align-items: center;
    overflow-x: auto;
    border-right: none;
    border-bottom: 1px solid #1e1e1e;
  }
  .ik-admin__brand {
    display: none;
  }
  .ik-admin__nav {
    flex-direction: row;
    padding: 8px;
  }
  .ik-admin__nav-item {
    white-space: nowrap;
  }
  .ik-admin__side-footer {
    display: none;
  }
  .ik-admin__content {
    padding: 16px;
  }
}
</style>
