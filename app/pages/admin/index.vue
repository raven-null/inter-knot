<script setup lang="ts">
definePageMeta({ layout: "admin", middleware: "admin" });

const admin = useAdminApi();
const loading = ref(true);
const data = ref<any>({});
const openReports = ref(0);

const KPI_W = 720;
const KPI_H = 200;
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
  { label: "注册用户", value: data.value.userCount ?? 0, to: "/admin/users" },
  { label: "委托总数", value: data.value.postCount ?? 0, to: "/admin/posts" },
  { label: "评论总数", value: data.value.commentCount ?? 0, to: "/admin/comments" },
  { label: "总浏览量", value: data.value.viewCount ?? 0, to: "/admin/posts" },
  { label: "待审核", value: data.value.pendingPosts ?? 0, to: "/admin/review", warn: true },
  { label: "待处理举报", value: openReports.value, to: "/admin/reports", warn: true },
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

      <div class="ik-admin-grid" style="grid-template-columns: 1fr 1fr">
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
