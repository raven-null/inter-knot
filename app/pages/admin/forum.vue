<script setup lang="ts">
definePageMeta({ layout: "admin", middleware: "admin" });

import { useMessage } from "zenless-ui";
import { resolveErrorMessage } from "~/utils/api-error";

const admin = useAdminApi();
const confirmDialog = useConfirmDialog();
const message = useMessage();
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
// 正在删除的标签 documentId（按钮 loading 态）
const deletingTag = ref<string | null>(null);

const NAV_SWITCHES: Array<{ key: keyof typeof forumSettings.value; label: string; desc: string }> = [
  { key: "showSearch", label: "搜索框", desc: "首页工具栏搜索框" },
  { key: "showPresence", label: "在线人数", desc: "后台概览在线人数卡片" },
  { key: "showKnock", label: "敲敲", desc: "顶部导航敲敲图标入口" },
  { key: "showCreate", label: "发布导航", desc: "顶部导航「发布」标签" },
  { key: "showAdmin", label: "后台导航", desc: "顶部导航「后台」标签" },
];

const toggleNav = async (key: keyof typeof forumSettings.value) => {
  const anyRef = forumSettings.value as any;
  const next = !anyRef[key];
  try {
    await admin.updateSettings({ [key]: next });
    anyRef[key] = next;
    (siteSettings as any).value[key] = next;
    message.success(next ? `已开启「${NAV_SWITCHES.find((s) => s.key === key)?.label || key}」` : `已关闭「${NAV_SWITCHES.find((s) => s.key === key)?.label || key}」`);
  } catch (err) {
    message.error(resolveErrorMessage(err, "保存设置失败"));
  }
};

const saveAnnouncement = async () => {
  savingForum.value = true;
  try {
    await admin.updateSettings({ announcement: forumSettings.value.announcement });
    (siteSettings as any).value.announcement = forumSettings.value.announcement;
    saveAnnounceDone.value = true;
    setTimeout(() => (saveAnnounceDone.value = false), 2000);
  } catch (err) {
    message.error(resolveErrorMessage(err, "保存公告失败"));
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
  } catch (err) {
    message.error(resolveErrorMessage(err, "加载设置失败"));
  } finally {
    loading.value = false;
  }
};

const toggleTag = async (c: any) => {
  const next = !c.isHidden;
  try {
    await admin.updateCategory(c.documentId, { isHidden: next });
    c.isHidden = next;
    message.success(next ? `已隐藏「${c.name}」` : `已显示「${c.name}」`);
  } catch (err) {
    message.error(resolveErrorMessage(err, "操作失败"));
  }
};

const removeTag = async (c: any) => {
  const ok = await confirmDialog.open({
    title: "删除标签",
    message: `确定删除标签「${c.name}」吗？删除后该标签下的帖子将不再归属任何标签。`,
    confirmText: "删除",
    danger: true,
  });
  if (!ok) return;
  deletingTag.value = c.documentId;
  try {
    await admin.deleteCategory(c.documentId);
    message.success(`已删除标签「${c.name}」`);
    await loadData();
  } catch (err) {
    message.error(resolveErrorMessage(err, "删除标签失败"));
  } finally {
    deletingTag.value = null;
  }
};

const addTag = async () => {
  const name = newTag.value.name.trim();
  const slug = newTag.value.slug.trim().toLowerCase().replace(/\s+/g, "-");
  if (!name || !slug) {
    message.warning("请填写标签名称与标识");
    return;
  }
  // slug 冲突检测：已存在同名标识时提示，避免重复
  if (tags.value.some((c) => c.slug === slug)) {
    message.error(`已存在标识为「${slug}」的标签`);
    return;
  }
  try {
    await admin.createCategory({ name, slug, description: "", sortOrder: tags.value.length + 1 });
    newTag.value = { name: "", slug: "" };
    message.success(`已新增标签「${name}」`);
    await loadData();
  } catch (err) {
    message.error(resolveErrorMessage(err, "新增标签失败"));
  }
};

onMounted(async () => {
  void loadSiteSettings();
  await loadData();
});
</script>

<template>
  <div class="ik-admin-page">
    <div class="ik-forum-header">
      <AdminBackButton />
      <div class="ik-forum-header__text">
        <h2 class="ik-forum-header__title">论坛设置</h2>
        <p class="ik-forum-header__desc">管理导航开关、标签（版块）与首页公告</p>
      </div>
    </div>

    <div v-if="loading" class="ik-admin-loading">加载中…</div>
    <div v-else class="ik-admin-grid ik-admin-grid--settings">
      <!-- 导航栏功能开关 -->
      <AdminCard>
        <template #title>
          <span class="ik-forum-card-title">导航栏功能开关</span>
          <AdminBadge tone="blue">{{ NAV_SWITCHES.filter((s) => forumSettings[s.key]).length }}/{{ NAV_SWITCHES.length }} 开启</AdminBadge>
        </template>
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

      <!-- 标签管理 -->
      <AdminCard>
        <template #title>
          <span class="ik-forum-card-title">标签管理（版块）</span>
          <AdminBadge>{{ tags.length }} 个标签</AdminBadge>
        </template>

        <!-- 新增表单 -->
        <div class="ik-forum-tag-add">
          <input
            v-model="newTag.name"
            class="ik-admin-input"
            placeholder="名称（如：闲聊）"
            @keyup.enter="addTag"
          />
          <input
            v-model="newTag.slug"
            class="ik-admin-input"
            placeholder="标识（如：chat）"
            @keyup.enter="addTag"
          />
          <button class="ik-admin-btn ik-admin-btn--primary" @click="addTag">新增标签</button>
        </div>

        <!-- 标签列表 -->
        <div v-if="tags.length" class="ik-forum-tag-list">
          <div v-for="c in tags" :key="c.documentId" class="ik-forum-tag-row">
            <div class="ik-forum-tag-row__main">
              <div class="ik-forum-tag-row__name">
                {{ c.name }}
                <AdminBadge v-if="c.adminOnly" tone="yellow">管理</AdminBadge>
              </div>
              <code class="ik-forum-tag-row__slug">{{ c.slug }}</code>
            </div>
            <AdminBadge :tone="c.isHidden ? 'red' : 'green'">{{ c.isHidden ? "已隐藏" : "显示中" }}</AdminBadge>
            <div class="ik-forum-tag-row__actions">
              <button
                class="ik-admin-btn"
                :title="c.isHidden ? '点击显示该标签' : '点击隐藏该标签'"
                @click="toggleTag(c)"
              >{{ c.isHidden ? "显示" : "隐藏" }}</button>
              <button
                class="ik-admin-btn ik-admin-btn--danger"
                :disabled="deletingTag === c.documentId"
                @click="removeTag(c)"
              >{{ deletingTag === c.documentId ? "删除中…" : "删除" }}</button>
            </div>
          </div>
        </div>
        <div v-else class="ik-admin-empty">暂无标签，请在上方新增</div>
      </AdminCard>

      <!-- 公告编写 -->
      <AdminCard>
        <template #title>
          <span class="ik-forum-card-title">公告编写</span>
          <AdminBadge v-if="forumSettings.announcement.trim()" tone="green">已启用</AdminBadge>
          <AdminBadge v-else tone="gray">未启用</AdminBadge>
        </template>
        <textarea
          v-model="forumSettings.announcement"
          class="ik-admin-input ik-forum-announcement"
          rows="4"
          placeholder="首页顶部展示的公告内容，留空则不显示"
        ></textarea>
        <div class="ik-forum-announcement__foot">
          <span class="ik-forum-announcement__count">{{ forumSettings.announcement.length }} 字</span>
          <div class="ik-forum-announcement__actions">
            <span v-if="saveAnnounceDone" class="ik-forum-announcement__saved">已保存 ✓</span>
            <button class="ik-admin-btn ik-admin-btn--primary" :disabled="savingForum" @click="saveAnnouncement">
              {{ savingForum ? "保存中…" : "保存公告" }}
            </button>
          </div>
        </div>
      </AdminCard>
    </div>
  </div>
</template>
