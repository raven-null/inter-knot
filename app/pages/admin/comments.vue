<script setup lang="ts">
definePageMeta({ layout: "admin", middleware: "admin" });

const admin = useAdminApi();
const list = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const keyword = ref("");
const loading = ref(false);

const load = async () => {
  loading.value = true;
  try {
    const res = await admin.comments(page.value, pageSize, keyword.value);
    list.value = res?.data || [];
    total.value = res?.meta?.pagination?.total || 0;
  } finally {
    loading.value = false;
  }
};

const doSearch = () => {
  page.value = 1;
  load();
};

const remove = async (c: any) => {
  if (!window.confirm("确认删除这条评论？")) return;
  await admin.deleteComment(c.documentId);
  await load();
};

onMounted(load);
</script>

<template>
  <div class="ik-admin-page">
    <div class="ik-admin-toolbar">
      <AdminBackButton />
      <input v-model="keyword" class="ik-admin-input" placeholder="搜索评论内容" @keyup.enter="doSearch" />
      <button class="ik-admin-btn ik-admin-btn--primary" @click="doSearch">搜索</button>
    </div>

    <AdminCard>
      <div v-if="loading" class="ik-admin-loading">加载中…</div>
      <table v-else class="ik-admin-table">
        <thead>
          <tr>
            <th>作者</th>
            <th>内容</th>
            <th>点赞</th>
            <th>时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in list" :key="c.documentId">
            <td>
              <div style="display: flex; align-items: center; gap: 8px">
                <img :src="c.author?.avatar" class="ik-admin-avatar" alt="" />
                <span>{{ c.author?.name || "-" }}</span>
              </div>
            </td>
            <td style="max-width: 420px">
              <div style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden">{{ c.content }}</div>
            </td>
            <td>{{ c.likesCount }}</td>
            <td><RelativeTime :time="c.createdAt" /></td>
            <td>
              <button class="ik-admin-btn ik-admin-btn--danger" @click="remove(c)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!loading && !list.length" class="ik-admin-empty">没有找到评论</div>

      <div class="ik-admin-pager">
        <button class="ik-admin-btn" :disabled="page <= 1" @click="page--; load()">上一页</button>
        <span>第 {{ page }} 页 / 共 {{ Math.ceil(total / pageSize) }} 页（{{ total }} 条）</span>
        <button class="ik-admin-btn" :disabled="page >= Math.ceil(total / pageSize)" @click="page++; load()">下一页</button>
      </div>
    </AdminCard>
  </div>
</template>
