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

/* ── 表情包管理 ─────────────────────────────── */
const emotes = ref<{ groups: Array<{ name: string; order: number; iconUrl: string | null }>; emotes: any[] }>({ groups: [], emotes: [] });
const newEmote = ref<{ code: string; name: string; group: string; dataUrl: string }>({ code: "", name: "", group: "通用", dataUrl: "" });
const newGroupName = ref("");
const emoteSaving = ref(false);
const deletingEmote = ref<string | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

const emoteGroups = computed(() => emotes.value.groups.map((g) => g.name));

/** 读取图片文件 → canvas 压缩为 WebP → base64 dataUrl */
async function fileToWebpDataUrl(file: File): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("图片加载失败"));
    el.src = url;
  });
  const MAX_EDGE = 128;
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建画布");
  ctx.drawImage(img, 0, 0, w, h);
  const dataUrl = canvas.toDataURL("image/webp", 0.85);
  if (!dataUrl.startsWith("data:image/webp")) throw new Error("浏览器不支持 WebP 转换");
  return dataUrl;
}

function onEmoteFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      newEmote.value.dataUrl = await fileToWebpDataUrl(file);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "图片处理失败");
      newEmote.value.dataUrl = "";
    }
  };
  reader.readAsDataURL(file);
}

async function addEmote() {
  const code = newEmote.value.code.trim().toLowerCase();
  const name = newEmote.value.name.trim();
  if (!code || !name) {
    message.warning("请填写表情代码与名称");
    return;
  }
  if (!/^ik-[a-z0-9-]{1,32}$/.test(code)) {
    message.error("表情代码需为 ik- 开头的小写字母数字，如 ik-smile");
    return;
  }
  if (!newEmote.value.dataUrl) {
    message.warning("请先选择表情图片");
    return;
  }
  emoteSaving.value = true;
  try {
    await admin.createEmote({
      code,
      name,
      group: newEmote.value.group || "通用",
      dataUrl: newEmote.value.dataUrl,
    });
    message.success(`已添加表情「${name}」`);
    newEmote.value = { code: "", name: "", group: "通用", dataUrl: "" };
    if (fileInputRef.value) fileInputRef.value.value = "";
    await loadEmotes();
  } catch (err) {
    message.error(resolveErrorMessage(err, "添加表情失败"));
  } finally {
    emoteSaving.value = false;
  }
}

async function removeEmote(emote: any) {
  const ok = await confirmDialog.open({
    title: "删除表情",
    message: `确定删除表情「${emote.name}」（:${emote.code}:）吗？引用该表情的旧评论将显示为代码文本。`,
    confirmText: "删除",
    danger: true,
  });
  if (!ok) return;
  deletingEmote.value = emote.code;
  try {
    await admin.deleteEmote(emote.code);
    message.success(`已删除「${emote.name}」`);
    await loadEmotes();
  } catch (err) {
    message.error(resolveErrorMessage(err, "删除表情失败"));
  } finally {
    deletingEmote.value = null;
  }
}

async function addGroup() {
  const name = newGroupName.value.trim();
  if (!name) {
    message.warning("请填写分组名称");
    return;
  }
  if (emoteGroups.value.includes(name)) {
    message.error("分组已存在");
    return;
  }
  try {
    await admin.addEmoteGroup(name);
    message.success(`已新增分组「${name}」`);
    newGroupName.value = "";
    await loadEmotes();
  } catch (err) {
    message.error(resolveErrorMessage(err, "新增分组失败"));
  }
}

async function removeGroup(groupName: string) {
  const ok = await confirmDialog.open({
    title: "删除分组",
    message: `确定删除分组「${groupName}」吗？该分组下的表情将移动到「通用」。`,
    confirmText: "删除",
    danger: true,
  });
  if (!ok) return;
  try {
    await admin.deleteEmoteGroup(groupName);
    message.success(`已删除分组「${groupName}」`);
    await loadEmotes();
  } catch (err) {
    message.error(resolveErrorMessage(err, "删除分组失败"));
  }
}

const loadEmotes = async () => {
  try {
    emotes.value = await admin.emotes();
  } catch (err) {
    message.error(resolveErrorMessage(err, "加载表情失败"));
  }
};

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

void loadEmotes();

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
        <p class="ik-forum-header__desc">管理导航开关、标签（版块）、表情包与首页公告</p>
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

      <!-- 表情包管理 -->
      <AdminCard>
        <template #title>
          <span class="ik-forum-card-title">表情包管理</span>
          <AdminBadge>{{ emotes.emotes.length }} 个表情</AdminBadge>
        </template>

        <!-- 新增表单 -->
        <div class="ik-emote-add">
          <label class="ik-emote-add__file">
            <input
              ref="fileInputRef"
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              hidden
              @change="onEmoteFileChange"
            />
            <img
              v-if="newEmote.dataUrl"
              :src="newEmote.dataUrl"
              alt="预览"
              class="ik-emote-add__preview"
            />
            <span v-else class="ik-emote-add__placeholder">选择图片</span>
          </label>
          <div class="ik-emote-add__fields">
            <div class="ik-emote-add__row">
              <input
                v-model="newEmote.code"
                class="ik-admin-input"
                placeholder="代码（如 ik-smile）"
                @keyup.enter="addEmote"
              />
              <input
                v-model="newEmote.name"
                class="ik-admin-input"
                placeholder="名称（如：微笑）"
                @keyup.enter="addEmote"
              />
            </div>
            <div class="ik-emote-add__row">
              <select v-model="newEmote.group" class="ik-admin-input ik-emote-add__select">
                <option v-for="g in emoteGroups" :key="g" :value="g">{{ g }}</option>
              </select>
              <button class="ik-admin-btn ik-admin-btn--primary" :disabled="emoteSaving" @click="addEmote">
                {{ emoteSaving ? "上传中…" : "添加表情" }}
              </button>
            </div>
          </div>
        </div>

        <!-- 表情列表 -->
        <div v-if="emotes.emotes.length" class="ik-emote-grid">
          <div v-for="e in emotes.emotes" :key="e.code" class="ik-emote-item">
            <img :src="e.url" :alt="e.name" class="ik-emote-item__img" loading="lazy" />
            <div class="ik-emote-item__meta">
              <span class="ik-emote-item__name">{{ e.name }}</span>
              <code class="ik-emote-item__code">{{ e.code }}</code>
              <span class="ik-emote-item__group">{{ e.group }}</span>
            </div>
            <button
              class="ik-admin-btn ik-admin-btn--danger ik-emote-item__del"
              :disabled="deletingEmote === e.code"
              @click="removeEmote(e)"
            >{{ deletingEmote === e.code ? "删除中…" : "删除" }}</button>
          </div>
        </div>
        <div v-else class="ik-admin-empty">暂无表情，请上传第一个表情包</div>

        <!-- 分组管理 -->
        <div class="ik-emote-groups">
          <div class="ik-emote-groups__head">分组管理</div>
          <div class="ik-forum-tag-add">
            <input
              v-model="newGroupName"
              class="ik-admin-input"
              placeholder="新分组名称（如：摸鱼）"
              @keyup.enter="addGroup"
            />
            <button class="ik-admin-btn" @click="addGroup">新增分组</button>
          </div>
          <div class="ik-emote-groups__list">
            <span
              v-for="g in emotes.groups"
              :key="g.name"
              class="ik-emote-groups__chip"
            >
              {{ g.name }}
              <button
                v-if="g.name !== '通用'"
                class="ik-emote-groups__chip-del"
                title="删除分组"
                @click="removeGroup(g.name)"
              >×</button>
            </span>
          </div>
        </div>
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
