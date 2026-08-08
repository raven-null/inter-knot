<script setup lang="ts">
definePageMeta({ layout: "admin", middleware: "admin" });

const admin = useAdminApi();
const list = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const loading = ref(false);
const processing = ref<string | null>(null);

const load = async () => {
  loading.value = true;
  try {
    const res = await admin.posts(page.value, pageSize, "", "pending");
    list.value = res?.data || [];
    total.value = res?.meta?.pagination?.total || 0;
  } finally {
    loading.value = false;
  }
};

const approve = async (p: any) => {
  processing.value = p.documentId;
  try {
    await admin.updatePost(p.documentId, { status: "published" });
    await load();
  } finally {
    processing.value = null;
  }
};

const reject = async (p: any) => {
  if (!window.confirm(`驳回帖子「${p.title}」？将退回作者草稿箱。`)) return;
  processing.value = p.documentId;
  try {
    await admin.updatePost(p.documentId, { status: "draft" });
    await load();
  } finally {
    processing.value = null;
  }
};

const approveAll = async () => {
  if (!list.value.length) return;
  if (!window.confirm(`通过本页全部 ${list.value.length} 条待审帖子？`)) return;
  for (const p of list.value) {
    await admin.updatePost(p.documentId, { status: "published" });
  }
  await load();
};

onMounted(load);
</script>

<template>
  <div class="ik-admin-page">
    <div class="ik-admin-toolbar" style="justify-content: space-between">
      <div style="display: flex; align-items: center; gap: 10px">
        <AdminBackButton />
        <span style="color: var(--ik-muted, #9a9a9a); font-size: 13px">
          待审核 <b style="color: #ffb84d">{{ total }}</b> 条
        </span>
      </div>
      <button class="ik-admin-btn ik-admin-btn--primary" :disabled="!list.length" @click="approveAll">
        通过本页全部
      </button>
    </div>

    <AdminCard>
      <div v-if="loading" class="ik-admin-loading">加载中…</div>
      <div v-else-if="!list.length" class="ik-admin-empty">没有待审核的帖子 🎉</div>
      <ul v-else class="ik-admin-review">
        <li v-for="p in list" :key="p.documentId" class="ik-admin-review__item">
          <div class="ik-admin-review__main">
            <div class="ik-admin-review__title">{{ p.title }}</div>
            <div class="ik-admin-review__meta">
              <span>作者：{{ p.author?.name || "-" }}</span>
              <span v-if="p.category?.name">版块：{{ p.category.name }}</span>
              <span><RelativeTime :time="p.createdAt" /></span>
            </div>
          </div>
          <div class="ik-admin-review__actions">
            <button class="ik-admin-btn ik-admin-btn--primary" :disabled="processing === p.documentId" @click="approve(p)">通过</button>
            <button class="ik-admin-btn ik-admin-btn--danger" :disabled="processing === p.documentId" @click="reject(p)">驳回</button>
          </div>
        </li>
      </ul>

      <div class="ik-admin-pager">
        <button class="ik-admin-btn" :disabled="page <= 1" @click="page--; load()">上一页</button>
        <span>第 {{ page }} 页 / 共 {{ Math.ceil(total / pageSize) }} 页</span>
        <button class="ik-admin-btn" :disabled="page >= Math.ceil(total / pageSize)" @click="page++; load()">下一页</button>
      </div>
    </AdminCard>
  </div>
</template>
