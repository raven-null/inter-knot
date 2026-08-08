<script setup lang="ts">
definePageMeta({ layout: "admin", middleware: "admin" });

const admin = useAdminApi();
const { settings: siteSettings, load: loadSiteSettings } = useSiteSettings();

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
const loading = ref(true);

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

const loadData = async () => {
  loading.value = true;
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
  } finally {
    loading.value = false;
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
  await loadData();
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
  await loadData();
};

onMounted(async () => {
  void loadSiteSettings();
  await loadData();
});
</script>

<template>
  <div class="ik-admin-page">
    <div class="ik-admin-toolbar">
      <AdminBackButton />
    </div>

    <div v-if="loading" class="ik-admin-loading">加载中…</div>
    <div v-else class="ik-admin-grid ik-admin-grid--settings">
      <AdminCard>
        <template #title>导航栏功能开关</template>
        <div class="ik-forum-settings__switches">
          <label v-for="s in NAV_SWITCHES" :key="s.key" class="ik-forum-settings__switch">
            <span class="ik-forum-settings__switch-text">
              <b>{{ s.label }}</b>
              <em>{{ s.desc }}</em>
            </span>
            <z-switch :model-value="Boolean(forumSettings[s.key])" @change="toggleNav(s.key)" />
          </label>
        </div>
      </AdminCard>

      <AdminCard>
        <template #title>标签管理（版块）</template>
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
      </AdminCard>

      <AdminCard>
        <template #title>公告编写</template>
        <textarea
          v-model="forumSettings.announcement"
          class="ik-admin-input"
          rows="4"
          placeholder="首页顶部展示的公告内容，留空则不显示"
          style="width: 100%; resize: vertical; font-family: inherit"
        ></textarea>
        <div style="display: flex; align-items: center; gap: 10px; margin-top: 10px">
          <button class="ik-admin-btn ik-admin-btn--primary" :disabled="savingForum" @click="saveAnnouncement">
            {{ savingForum ? "保存中…" : "保存公告" }}
          </button>
          <span v-if="saveAnnounceDone" style="color: #7ee787; font-size: 12px">已保存 ✓</span>
        </div>
      </AdminCard>
    </div>
  </div>
</template>
