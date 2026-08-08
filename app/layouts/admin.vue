<script setup lang="ts">
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const navItems = [
  { to: "/admin", label: "数据概览", icon: "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" },
  { to: "/admin/users", label: "用户管理", icon: "M16 11a4 4 0 10-4-4 4 4 0 004 4zm-8 2a5 5 0 00-5 5v3h10v-3a5 5 0 00-5-5zm8 0a3 3 0 00-3 3v5h8v-5a3 3 0 00-3-3z" },
  { to: "/admin/posts", label: "帖子管理", icon: "M4 4h16v4H4zM4 10h16v2H4zM4 14h16v2H4zM4 18h10v2H4z" },
  { to: "/admin/comments", label: "评论管理", icon: "M4 4h16a2 2 0 012 2v10a2 2 0 01-2 2H8l-5 5V6a2 2 0 012-2z" },
  { to: "/admin/categories", label: "版块管理", icon: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" },
  { to: "/admin/settings", label: "站点设置", icon: "M19.4 13a7.9 7.9 0 000-2l2-1.5-2-3.5-2.4 1a8 8 0 00-1.7-1L15 3h-4l-.3 2.4a8 8 0 00-1.7 1l-2.4-1-2 3.5L6.6 11a8 8 0 000 2l-2 1.5 2 3.5 2.4-1a8 8 0 001.7 1L11 21h4l.3-2.4a8 8 0 001.7-1l2.4 1 2-3.5-2-1.1z" },
];

const isActive = (to: string) => {
  if (to === "/admin") return route.path === "/admin";
  return route.path.startsWith(to);
};

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
        <NuxtLink
          v-for="item in navItems"
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
      </nav>
      <div class="ik-admin__side-footer">
        <NuxtLink to="/" class="ik-admin__back">← 返回前台</NuxtLink>
      </div>
    </aside>

    <main class="ik-admin__main">
      <header class="ik-admin__topbar">
        <h1 class="ik-admin__title">{{ navItems.find((i) => isActive(i.to))?.label || "后台管理" }}</h1>
        <span class="ik-admin__uid">管理员 · {{ auth.user?.name || auth.user?.username }}</span>
      </header>
      <div class="ik-admin__content">
        <slot />
      </div>
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
  gap: 4px;
  overflow-y: auto;
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
}

.ik-admin__topbar {
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
  padding: 24px;
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
