<script setup lang="ts">
definePageMeta({ layout: "admin", middleware: "admin" });

const admin = useAdminApi();
const loading = ref(true);
const data = ref<any>({});
const openReports = ref(0);
const { online: presenceOnline, avatars: presenceAvatars, users: presenceUsers } = usePresence();

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
    label: "委托",
    to: "/admin/posts",
    value: data.value.postCount ?? 0,
    sub: `评论 ${data.value.commentCount ?? 0} · 浏览 ${data.value.viewCount ?? 0}`,
  },
  {
    label: "审核",
    to: "/admin/review",
    value: data.value.pendingPosts ?? 0,
    sub: "待审核委托",
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
          <table class="ik-admin-table">
            <thead>
              <tr><th>用户</th><th>等级</th><th>注册时间</th></tr>
            </thead>
            <tbody>
              <tr v-for="u in (data.recentUsers as any[] || [])" :key="u.documentId">
                <td>
                  <div style="display:flex;align-items:center;gap:8px">
                    <img :src="u.avatar" class="ik-admin-avatar" alt="" />
                    <NuxtLink :to="`/profile/${u.documentId}`" style="color:inherit;text-decoration:none">{{ u.name }}</NuxtLink>
                  </div>
                </td>
                <td>Lv.{{ u.level }}</td>
                <td><RelativeTime :time="u.createdAt" /></td>
              </tr>
            </tbody>
          </table>
        </AdminCard>

        <AdminCard>
          <template #title>在线人数</template>
          <div class="ik-admin-online">
            <div class="ik-admin-online__count">
              <span class="ik-admin-online__dot" aria-hidden="true" />
              <span class="ik-admin-online__num">{{ presenceOnline }}</span>
              <span>人在线</span>
            </div>
            <div class="ik-admin-online__stack" aria-hidden="true">
              <img
                v-for="(url, i) in presenceAvatars.slice(0, 5)"
                :key="url + i"
                :src="url"
                class="ik-admin-online__avatar"
                alt=""
                loading="lazy"
              />
              <span v-if="presenceOnline > 5" class="ik-admin-online__more">+{{ presenceOnline - 5 }}</span>
            </div>
            <div class="ik-admin-online__note">在线用户实时心跳，每 20 秒更新</div>

            <ul v-if="presenceUsers.length" class="ik-admin-online__list">
              <li v-for="u in presenceUsers" :key="u.username" class="ik-admin-online__row">
                <img :src="u.avatar" class="ik-admin-online__row-avatar" alt="" loading="lazy" />
                <span class="ik-admin-online__row-name">{{ u.name }}</span>
                <AdminBadge tone="blue">Lv.{{ u.level }}</AdminBadge>
                <span class="ik-admin-online__row-duration">{{ formatDuration(u.durationSeconds) }}</span>
              </li>
            </ul>
            <div v-else class="ik-admin-online__empty">暂无登录用户在线</div>
          </div>
        </AdminCard>

        <AdminCard>
          <template #title>最新委托</template>
          <table class="ik-admin-table">
            <thead>
              <tr><th>标题</th><th>浏览</th><th>点赞</th><th>评论</th></tr>
            </thead>
            <tbody>
              <tr v-for="p in (data.recentPosts as any[] || [])" :key="p.documentId">
                <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                  <NuxtLink :to="`/post/${p.documentId}`" style="color:inherit;text-decoration:none">{{ p.title }}</NuxtLink>
                </td>
                <td>{{ p.views }}</td>
                <td>{{ p.likesCount }}</td>
                <td>{{ p.commentsCount }}</td>
              </tr>
            </tbody>
          </table>
        </AdminCard>
      </div>
    </template>
  </div>
</template>
