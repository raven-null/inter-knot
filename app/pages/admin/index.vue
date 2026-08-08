<script setup lang="ts">
definePageMeta({ layout: "admin", middleware: "admin" });

const admin = useAdminApi();
const loading = ref(true);
const data = ref<any>({});
const openReports = ref(0);
const { online: presenceOnline, users: presenceUsers } = usePresence();

const formatDuration = (seconds: number) => {
  if (seconds < 60) return `${seconds} 秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时`;
  return `${Math.floor(seconds / 86400)} 天`;
};

const KPI_W = 720;
const KPI_H = 320;
const KPI_PAD = 28;

const series = computed(() => {
  const t = Array.isArray(data.value.trend) ? data.value.trend : [];
  const points = (key: string) =>
    t.map((d: any, i: number) => {
      const x = KPI_PAD + (i / Math.max(1, t.length - 1)) * (KPI_W - KPI_PAD * 2);
      const max = Math.max(1, ...t.flatMap((d2: any) => [d2.posts, d2.comments, d2.users]));
      const y = KPI_H - KPI_PAD - (Number(d[key] || 0) / max) * (KPI_H - KPI_PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
  return {
    dates: t.map((d: any) => String(d.date || "").slice(5)),
    posts: points("posts"),
    comments: points("comments"),
    users: points("users"),
  };
});

const kpi = computed(() => [
  {
    label: "用户",
    to: "/admin/users",
    value: data.value.userCount ?? 0,
    sub: "注册用户",
  },
  {
    label: "帖子",
    to: "/admin/posts",
    value: data.value.postCount ?? 0,
    sub: `评论 ${data.value.commentCount ?? 0} · 浏览 ${data.value.viewCount ?? 0}`,
  },
  {
    label: "审核",
    to: "/admin/review",
    value: data.value.pendingPosts ?? 0,
    sub: "待审核帖子",
    warn: true,
  },
  {
    label: "举报审核",
    to: "/admin/reports",
    value: openReports.value,
    sub: "待处理举报",
    warn: true,
  },
]);

onMounted(async () => {
  try {
    const [statsRes, reportsRes] = await Promise.all([
      admin.stats(),
      admin.reports(1, 1, "open"),
    ]);
    data.value = statsRes;
    openReports.value = reportsRes?.meta?.pagination?.total || 0;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="ik-admin-page">
    <div v-if="loading" class="ik-admin-loading">加载中…</div>
    <template v-else>
      <div class="ik-admin-grid">
        <NuxtLink
          v-for="k in kpi"
          :key="k.label"
          :to="k.to"
          class="ik-admin-stat"
          :class="{ 'ik-admin-stat--warn': k.warn && Number(k.value) > 0 }"
        >
          <span class="ik-admin-stat__label">{{ k.label }}</span>
          <span class="ik-admin-stat__value">{{ k.value }}</span>
          <span class="ik-admin-stat__sub">{{ k.sub }}</span>
        </NuxtLink>
      </div>

      <AdminCard>
        <template #title>近 30 天趋势</template>
        <div v-if="series.dates.length" class="ik-admin-trend">
          <svg :viewBox="`0 0 ${KPI_W} ${KPI_H}`" preserveAspectRatio="none" class="ik-admin-trend__svg">
            <polyline :points="series.posts.join(' ')" fill="none" stroke="#BFFF09" stroke-width="2" />
            <polyline :points="series.comments.join(' ')" fill="none" stroke="#00e5ff" stroke-width="2" />
            <polyline :points="series.users.join(' ')" fill="none" stroke="#ff9a3c" stroke-width="2" />
          </svg>
          <div class="ik-admin-trend__legend">
            <span><i class="ik-admin-trend__dot" style="background:#BFFF09" />新帖</span>
            <span><i class="ik-admin-trend__dot" style="background:#00e5ff" />新评论</span>
            <span><i class="ik-admin-trend__dot" style="background:#ff9a3c" />新用户</span>
          </div>
          <div class="ik-admin-trend__dates">
            <span v-for="(d, i) in series.dates" :key="i">{{ d }}</span>
          </div>
        </div>
        <AdminEmpty v-else />
      </AdminCard>

      <div class="ik-admin-grid ik-admin-grid--three">
        <AdminCard>
          <template #title>最新注册用户</template>
          <ul v-if="(data.recentUsers as any[] || []).length" class="ik-admin-online__list">
            <li
              v-for="u in (data.recentUsers as any[] || [])"
              :key="u.documentId"
              class="ik-admin-online__row"
            >
              <img :src="u.avatar" class="ik-admin-online__row-avatar" alt="" loading="lazy" />
              <NuxtLink
                :to="`/profile/${u.documentId}`"
                class="ik-admin-online__row-name"
                style="color: inherit; text-decoration: none"
              >{{ u.name }}</NuxtLink>
              <AdminBadge tone="blue">Lv.{{ u.level }}</AdminBadge>
              <span class="ik-admin-online__row-duration"><RelativeTime :time="u.createdAt" /></span>
            </li>
          </ul>
          <div v-else class="ik-admin-online__empty">暂无用户</div>
        </AdminCard>

        <AdminCard>
          <template #title>
            <span class="ik-admin-online__title">在线人数</span>
            <span class="ik-admin-online__badge">
              <span class="ik-admin-online__badge-dot" aria-hidden="true" />
              {{ presenceOnline }} 人在线
            </span>
          </template>
          <ul v-if="presenceUsers.length" class="ik-admin-online__list">
            <li v-for="u in presenceUsers" :key="u.username" class="ik-admin-online__row">
              <img :src="u.avatar" class="ik-admin-online__row-avatar" alt="" loading="lazy" />
              <span class="ik-admin-online__row-name">{{ u.name }}</span>
              <AdminBadge tone="blue">Lv.{{ u.level }}</AdminBadge>
              <span class="ik-admin-online__row-duration">{{ formatDuration(u.durationSeconds) }}</span>
            </li>
          </ul>
          <div v-else class="ik-admin-online__empty">暂无登录用户在线</div>
        </AdminCard>

        <AdminCard>
          <template #title>最新帖子</template>
          <ul v-if="(data.recentPosts as any[] || []).length" class="ik-admin-online__list">
            <li
              v-for="p in (data.recentPosts as any[] || [])"
              :key="p.documentId"
              class="ik-admin-online__row"
            >
              <NuxtLink
                :to="`/post/${p.documentId}`"
                class="ik-admin-online__row-name"
                style="color: inherit; text-decoration: none"
              >{{ p.title }}</NuxtLink>
              <span class="ik-admin-online__row-duration">浏览 {{ p.views }} · 赞 {{ p.likesCount }}</span>
            </li>
          </ul>
          <div v-else class="ik-admin-online__empty">暂无帖子</div>
        </AdminCard>
      </div>
    </template>
  </div>
</template>
