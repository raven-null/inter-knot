<script setup lang="ts">
definePageMeta({ layout: "admin", middleware: "admin" });

const admin = useAdminApi();
const list = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const keyword = ref("");
const statusFilter = ref("");
const loading = ref(false);

const STATUS_LABEL: Record<string, string> = {
  published: "已发布",
  pending: "待审核",
  draft: "草稿",
  deleted: "已删除",
};

const load = async () => {
  loading.value = true;
  try {
    const res = await admin.posts(page.value, pageSize, keyword.value, statusFilter.value);
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

const setStatus = async (p: any, status: string) => {
  await admin.updatePost(p.documentId, { status });
  p.status = status;
};

const togglePinned = async (p: any) => {
  const next = !p.isPinned;
  await admin.updatePost(p.documentId, { isPinned: next });
  p.isPinned = next;
};

const toggleHidden = async (p: any) => {
  const next = !p.isHidden;
  await admin.updatePost(p.documentId, { isHidden: next });
  p.isHidden = next;
};

onMounted(load);
</script>

<template>
  <div class="ik-admin-page">
    <div class="ik-admin-toolbar">
      <input
        v-model="keyword"
        class="ik-admin-input"
        placeholder="搜索标题 / 正文"
        @keyup.enter="doSearch"
      />
      <select v-model="statusFilter" class="ik-admin-input" style="min-width: 120px" @change="doSearch">
        <option value="">全部状态</option>
        <option value="published">已发布</option>
        <option value="pending">待审核</option>
        <option value="draft">草稿</option>
        <option value="deleted">已删除</option>
      </select>
      <button class="ik-admin-btn ik-admin-btn--primary" @click="doSearch">筛选</button>
    </div>

    <div class="ik-admin-card">
      <div v-if="loading" class="ik-admin-loading">加载中…</div>
      <table v-else class="ik-admin-table">
        <thead>
          <tr>
            <th>标题</th>
            <th>作者</th>
            <th>状态</th>
            <th>浏览</th>
            <th>点赞</th>
            <th>评论</th>
            <th>发布时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in list" :key="p.documentId">
            <td style="max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
              <NuxtLink :to="`/post/${p.documentId}`" style="color: inherit; text-decoration: none">{{ p.title }}</NuxtLink>
            </td>
            <td>{{ p.author?.name || "-" }}</td>
            <td>
              <span class="ik-admin-badge" :class="{
                'ik-admin-badge--green': p.status === 'published',
                'ik-admin-badge--yellow': p.status === 'pending',
                'ik-admin-badge--gray': p.status === 'draft',
                'ik-admin-badge--red': p.status === 'deleted',
              }">
                {{ STATUS_LABEL[p.status] || p.status }}
              </span>
            </td>
            <td>{{ p.views }}</td>
            <td>{{ p.likesCount }}</td>
            <td>{{ p.commentsCount }}</td>
            <td>{{ new Date(p.createdAt).toLocaleString() }}</td>
            <td>
              <div style="display: flex; gap: 6px; flex-wrap: wrap">
                <button class="ik-admin-btn" @click="togglePinned(p)">{{ p.isPinned ? "取消置顶" : "置顶" }}</button>
                <button class="ik-admin-btn" @click="toggleHidden(p)">{{ p.isHidden ? "显示" : "下架" }}</button>
                <template v-if="p.status === 'pending'">
                  <button class="ik-admin-btn ik-admin-btn--primary" @click="setStatus(p, 'published')">通过</button>
                  <button class="ik-admin-btn ik-admin-btn--danger" @click="setStatus(p, 'draft')">驳回</button>
                </template>
                <button v-else-if="p.status !== 'published'" class="ik-admin-btn ik-admin-btn--primary" @click="setStatus(p, 'published')">发布</button>
                <button v-if="p.status === 'published'" class="ik-admin-btn ik-admin-btn--danger" @click="setStatus(p, 'deleted')">删除</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!loading && !list.length" class="ik-admin-empty">没有找到帖子</div>

      <div class="ik-admin-pager">
        <button class="ik-admin-btn" :disabled="page <= 1" @click="page--; load()">上一页</button>
        <span>第 {{ page }} 页 / 共 {{ Math.ceil(total / pageSize) }} 页（{{ total }} 帖）</span>
        <button class="ik-admin-btn" :disabled="page >= Math.ceil(total / pageSize)" @click="page++; load()">下一页</button>
      </div>
    </div>
  </div>
</template>
