<script setup lang="ts">
definePageMeta({ layout: "admin", middleware: "admin" });

const admin = useAdminApi();
const loading = ref(true);
const saving = ref(false);
const saved = ref(false);
const form = ref({
  siteName: "绳网",
  announcement: "",
  allowRegister: true,
  needAudit: false,
});

const load = async () => {
  loading.value = true;
  try {
    form.value = await admin.settings();
  } finally {
    loading.value = false;
  }
};

const save = async () => {
  saving.value = true;
  saved.value = false;
  try {
    await admin.updateSettings(form.value);
    saved.value = true;
    setTimeout(() => (saved.value = false), 2000);
  } finally {
    saving.value = false;
  }
};

onMounted(load);
</script>

<template>
  <div class="ik-admin-page">
    <div class="ik-admin-toolbar">
      <AdminBackButton />
    </div>
    <div v-if="loading" class="ik-admin-loading">加载中…</div>
    <div v-else class="ik-admin-card" style="max-width: 560px">
      <h3 class="ik-admin-card__title">站点设置</h3>
      <div style="display: flex; flex-direction: column; gap: 14px">
        <label style="display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--ik-muted)">
          站点名称
          <input v-model="form.siteName" class="ik-admin-input" />
        </label>

        <label style="display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--ik-muted)">
          公告
          <textarea
            v-model="form.announcement"
            class="ik-admin-input"
            rows="3"
            style="resize: vertical; font-family: inherit"
          />
        </label>

        <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer">
          <input v-model="form.allowRegister" type="checkbox" />
          允许开放注册
        </label>

        <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer">
          <input v-model="form.needAudit" type="checkbox" />
          新帖需审核后发布
        </label>

        <div style="display: flex; align-items: center; gap: 12px; margin-top: 6px">
          <button class="ik-admin-btn ik-admin-btn--primary" :disabled="saving" @click="save">
            {{ saving ? "保存中…" : "保存设置" }}
          </button>
          <span v-if="saved" style="color: #7ee787; font-size: 13px">已保存 ✓</span>
        </div>
      </div>
    </div>
  </div>
</template>
