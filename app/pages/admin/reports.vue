<script setup lang="ts">
definePageMeta({ layout: "admin", middleware: "admin" });

const admin = useAdminApi();
const list = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const statusFilter = ref("");
const loading = ref(false);

const STATUS_TONE: Record<string, string> = {
  open: "yellow",
  resolved: "green",
  dismissed: "gray",
};
const STATUS_LABEL: Record<string, string> = {
  open: "待处理",
  resolved: "已处理",
  dismissed: "已忽略",
};

const load = async () => {
  loading.value = true;
  try {
    const res = await admin.reports(page.value, pageSize, statusFilter.value);
    list.value = res?.data || [];
    total.value = res?.meta?.pagination?.total || 0;
  } finally {
    loading.value = false;
  }
};

const dismiss = async (r: any) => {
  await admin.processReport(r.documentId, "dismiss");
  await load();
};

const removeTarget = async (r: any) => {
  const targetDesc =
    r.target?.type === "post" ? `帖子「${r.target?.title}」` : r.target?.type === "comment" ? "该评论" : "该用户";
  if (!window.confirm(`删除${targetDesc}并标记为已处理？`)) return;
  await admin.processReport(r.documentId, "delete");
  await load();
};

const targetLabel = (r: any) => {
  const t = r.target;
  if (!t) return "（对象已不存在）";
  if (t.type === "post") return `帖子「${t.title}」`;
  if (t.type === "comment") return `评论「${t.content}…」`;
  return `用户「${t.name}」`;
};

onMounted(load);
</script>

<template>
  <div class="ik-admin-page">
    <div class="ik-admin-toolbar">
      <select v-model="statusFilter" class="ik-admin-input" style="min-width: 120px" @change="page = 1; load()">
        <option value="">全部状态</option>
        <option value="open">待处理</option>
        <option value="resolved">已处理（删除）</option>
        <option value="dismissed">已忽略</option>
      </select>
    </div>

    <AdminCard>
      <div v-if="loading" class="ik-admin-loading">加载中…</div>
      <table v-else class="ik-admin-table">
        <thead>
          <tr>
            <th>举报对象</th>
            <th>原因</th>
            <th>举报人</th>
            <th>时间</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in list" :key="r.documentId">
            <td style="max-width: 260px">
              <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap">{{ targetLabel(r) }}</div>
              <div v-if="r.detail" style="color: #9a9a9a; font-size: 12px; margin-top: 2px">{{ r.detail }}</div>
            </td>
            <td>{{ r.reason }}</td>
            <td>{{ r.reporter?.name || "-" }}</td>
            <td><RelativeTime :time="r.createdAt" /></td>
            <td><AdminBadge :tone="STATUS_TONE[r.status] || 'gray'">{{ STATUS_LABEL[r.status] || r.status }}</AdminBadge></td>
            <td>
              <div v-if="r.status === 'open'" style="display: flex; gap: 6px">
                <button class="ik-admin-btn ik-admin-btn--danger" @click="removeTarget(r)">删除内容</button>
                <button class="ik-admin-btn" @click="dismiss(r)">忽略</button>
              </div>
              <span v-else style="color: #666; font-size: 12px">已处理</span>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!loading && !list.length" class="ik-admin-empty">暂无举报</div>

      <div class="ik-admin-pager">
        <button class="ik-admin-btn" :disabled="page <= 1" @click="page--; load()">上一页</button>
        <span>第 {{ page }} 页 / 共 {{ Math.ceil(total / pageSize) }} 页</span>
        <button class="ik-admin-btn" :disabled="page >= Math.ceil(total / pageSize)" @click="page++; load()">下一页</button>
      </div>
    </AdminCard>
  </div>
</template>
