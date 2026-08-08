<script setup lang="ts">
definePageMeta({ layout: "admin", middleware: "admin" });

const admin = useAdminApi();
const loading = ref(true);
const data = ref<any>({});
const openReports = ref(0);
const { online: presenceOnline, users: presenceUsers } = usePresence();
const { settings: siteSettings, load: loadSiteSettings } = useSiteSettings();

// ── 论坛设置卡片 ──────────────────────────────
const forumSettings = ref({
  showSearch: true,
  showPresence: true,
  showKnock: true,
  showCreate: true,
  showAdmin: true,
  announcement: "",
});
const tags = ref<any[]>([]);
const newTag = ref({ name: "", slug: "" });
const savingForum = ref(false);
const saveAnnounceDone = ref(false);

const NAV_SWITCHES: Array<{ key: keyof typeof forumSettings.value; label: string; desc: string }> = [
  { key: "showSearch", label: "搜索框", desc: "首页工具栏搜索框" },
  { key: "showPresence", label: "在线人数", desc: "后台概览在线人数卡片" },
  { key: "showKnock", label: "敲敲", desc: "顶部导航敲敲图标入口" },
  { key: "showCreate", label: "发布导航", desc: "顶部导航「发布」标签" },
  { key: "showAdmin", label: "后台导航", desc: "顶部导航「后台」标签" },
];

const toggleNav = async (key: keyof typeof forumSettings.value) => {
  const anyRef = forumSettings.value as any;
  anyRef[key] = !anyRef[key];
  await admin.updateSettings({ [key]: anyRef[key] });
  (siteSettings as any).value[key] = anyRef[key];
};

const saveAnnouncement = async () => {
  savingForum.value = true;
  try {
    await admin.updateSettings({ announcement: forumSettings.value.announcement });
    (siteSettings as any).value.announcement = forumSettings.value.announcement;
    saveAnnounceDone.value = true;
    setTimeout(() => (saveAnnounceDone.value = false), 2000);
  } finally {
    savingForum.value = false;
  }
};

const loadForumData = async () => {
  try {
    const [s, cats] = await Promise.all([admin.settings(), admin.categories()]);
    forumSettings.value = {
      showSearch: s.showSearch ?? true,
      showPresence: s.showPresence ?? true,
      showKnock: s.showKnock ?? true,
      showCreate: s.showCreate ?? true,
      showAdmin: s.showAdmin ?? true,
      announcement: s.announcement ?? "",
    };
    tags.value = cats;
  } catch {
    // 静默
  }
};

const toggleTag = async (c: any) => {
  const next = !c.isHidden;
  await admin.updateCategory(c.documentId, { isHidden: next });
  c.isHidden = next;
};

const removeTag = async (c: any) => {
  if (!window.confirm(`删除标签「${c.name}」？该版块下帖子将失去标签。`)) return;
  await admin.deleteCategory(c.documentId);
  await loadForumData();
};

const addTag = async () => {
  const name = newTag.value.name.trim();
  const slug = newTag.value.slug.trim().toLowerCase().replace(/\s+/g, "-");
  if (!name || !slug) {
    window.alert("请填写标签名称与标识");
    return;
  }
  await admin.createCategory({ name, slug, description: "", sortOrder: 0 });
  newTag.value = { name: "", slug: "" };
  await loadForumData();
};

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
  void loadSiteSettings();
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
  void loadForumData();
});
</script>

<template>
  <div class="ik-admin-page">
    <div v-if="loading" class="ik-admin-loading">加载中…</div>
    <template v-else>
      <div class="ik-admin-kpi-row">
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

        <!-- 论坛设置卡片（置于举报审核右侧） -->
        <AdminCard class="ik-admin-forum-settings">
          <template #title>论坛设置</template>
        <div class="ik-forum-settings__grid">
          <div class="ik-forum-settings__block">
            <h4 class="ik-forum-settings__block-title">导航栏功能开关</h4>
            <div class="ik-forum-settings__switches">
              <label v-for="s in NAV_SWITCHES" :key="s.key" class="ik-forum-settings__switch">
                <span class="ik-forum-settings__switch-text">
                  <b>{{ s.label }}</b>
                  <em>{{ s.desc }}</em>
                </span>
                <z-switch :model-value="Boolean(forumSettings[s.key])" @change="toggleNav(s.key)" />
              </label>
            </div>
          </div>

          <div class="ik-forum-settings__block">
            <h4 class="ik-forum-settings__block-title">标签管理（版块）</h4>
            <div class="ik-forum-settings__tags">
              <div v-for="c in tags" :key="c.documentId" class="ik-forum-settings__tag">
                <span class="ik-forum-settings__tag-name">{{ c.name }}</span>
                <span class="ik-forum-settings__tag-slug">{{ c.slug }}</span>
                <button class="ik-admin-btn" :title="c.isHidden ? '显示' : '隐藏'" @click="toggleTag(c)">{{ c.isHidden ? "显示" : "隐藏" }}</button>
                <button class="ik-admin-btn ik-admin-btn--danger" @click="removeTag(c)">删除</button>
              </div>
              <div class="ik-forum-settings__tag-add">
                <input v-model="newTag.name" class="ik-admin-input" placeholder="名称（如：闲聊）" />
                <input v-model="newTag.slug" class="ik-admin-input" placeholder="标识（如：chat）" />
                <button class="ik-admin-btn ik-admin-btn--primary" @click="addTag">新增</button>
              </div>
            </div>
          </div>

          <div class="ik-forum-settings__block">
            <h4 class="ik-forum-settings__block-title">公告编写</h4>
            <textarea
              v-model="forumSettings.announcement"
              class="ik-admin-input"
              rows="3"
              placeholder="首页顶部展示的公告内容，留空则不显示"
              style="width: 100%; resize: vertical; font-family: inherit"
            ></textarea>
            <div style="display: flex; align-items: center; gap: 10px; margin-top: 8px">
              <button class="ik-admin-btn ik-admin-btn--primary" :disabled="savingForum" @click="saveAnnouncement">
                {{ savingForum ? "保存中…" : "保存公告" }}
              </button>
              <span v-if="saveAnnounceDone" style="color: #7ee787; font-size: 12px">已保存 ✓</span>
            </div>
          </div>
        </div>
        </AdminCard>
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

        <AdminCard v-if="siteSettings.showPresence">
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
