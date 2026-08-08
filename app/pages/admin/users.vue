<script setup lang="ts">
definePageMeta({ layout: "admin", middleware: "admin" });

const admin = useAdminApi();
const api = useApi();
const list = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const keyword = ref("");
const loading = ref(false);

const drawerOpen = ref(false);
const current = ref<any>(null);
const currentPosts = ref<any[]>([]);

const load = async () => {
  loading.value = true;
  try {
    const res = await admin.users(page.value, pageSize, keyword.value);
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

const changeRole = async (u: any, role: string) => {
  await admin.updateUser(u.documentId, { role });
  u.role = role;
  if (current.value?.documentId === u.documentId) current.value.role = role;
};

const toggleBan = async (u: any) => {
  const next = u.status === "active" ? "banned" : "active";
  await admin.updateUser(u.documentId, { status: next });
  u.status = next;
  if (current.value?.documentId === u.documentId) current.value.status = next;
};

const openDetail = async (u: any) => {
  current.value = u;
  currentPosts.value = [];
  drawerOpen.value = true;
  try {
    const page2 = await api.getProfileArticles(u.documentId, "", 6);
    currentPosts.value = page2.nodes || [];
  } catch {
    currentPosts.value = [];
  }
};

onMounted(load);
</script>

<template>
  <div class="ik-admin-page">
    <div class="ik-admin-toolbar">
      <input
        v-model="keyword"
        class="ik-admin-input"
        placeholder="搜索 UID / 用户名 / 昵称 / 邮箱"
        @keyup.enter="doSearch"
      />
      <button class="ik-admin-btn ik-admin-btn--primary" @click="doSearch">搜索</button>
    </div>

    <AdminCard>
      <div v-if="loading" class="ik-admin-loading">加载中…</div>
      <table v-else class="ik-admin-table">
        <thead>
          <tr>
            <th>用户</th>
            <th>UID</th>
            <th>邮箱</th>
            <th>等级</th>
            <th>角色</th>
            <th>状态</th>
            <th>注册时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in list" :key="u.documentId">
            <td>
              <div style="display: flex; align-items: center; gap: 8px">
                <img :src="u.avatar" class="ik-admin-avatar" alt="" />
                <NuxtLink :to="`/profile/${u.documentId}`" style="color: inherit; text-decoration: none">{{ u.name }}</NuxtLink>
              </div>
            </td>
            <td style="font-variant-numeric: tabular-nums; color: var(--ik-primary, #bfff09)">{{ u.uid || "-" }}</td>
            <td>{{ u.email }}</td>
            <td>Lv.{{ u.level }}</td>
            <td>
              <select
                class="ik-admin-input"
                style="min-width: 0; padding: 4px 8px"
                :value="u.role"
                @change="changeRole(u, ($event.target as HTMLSelectElement).value)"
              >
                <option value="user">用户</option>
                <option value="moderator">版主</option>
                <option value="admin">管理员</option>
              </select>
            </td>
            <td>
              <AdminBadge :tone="u.status === 'active' ? 'green' : 'red'">
                {{ u.status === "active" ? "正常" : "已禁用" }}
              </AdminBadge>
            </td>
            <td><RelativeTime :time="u.createdAt" /></td>
            <td>
              <div style="display: flex; gap: 6px">
                <button class="ik-admin-btn" @click="openDetail(u)">详情</button>
                <button class="ik-admin-btn ik-admin-btn--danger" @click="toggleBan(u)">
                  {{ u.status === "active" ? "禁用" : "解禁" }}
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!loading && !list.length" class="ik-admin-empty">没有找到用户</div>

      <div class="ik-admin-pager">
        <button class="ik-admin-btn" :disabled="page <= 1" @click="page--; load()">上一页</button>
        <span>第 {{ page }} 页 / 共 {{ Math.ceil(total / pageSize) }} 页（{{ total }} 人）</span>
        <button class="ik-admin-btn" :disabled="page >= Math.ceil(total / pageSize)" @click="page++; load()">下一页</button>
      </div>
    </AdminCard>

    <AdminDrawer :open="drawerOpen" :title="current?.name || '用户详情'" width="460px" @close="drawerOpen = false">
      <template v-if="current">
        <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 16px">
          <img :src="current.avatar" style="width: 56px; height: 56px; border-radius: 12px; object-fit: cover" alt="" />
          <div>
            <div style="font-size: 16px; font-weight: 900">{{ current.name }}</div>
            <div style="color: var(--ik-primary, #bfff09); font-size: 13px; font-variant-numeric: tabular-nums">UID {{ current.uid || "-" }}</div>
            <div style="color: #9a9a9a; font-size: 12px">@{{ current.username }}</div>
          </div>
        </div>
        <div style="display: flex; gap: 6px; margin-bottom: 16px; flex-wrap: wrap">
          <AdminBadge :tone="current.role === 'admin' ? 'yellow' : current.role === 'moderator' ? 'blue' : 'gray'">{{ { user: "用户", moderator: "版主", admin: "管理员" }[current.role as string] || current.role }}</AdminBadge>
          <AdminBadge :tone="current.status === 'active' ? 'green' : 'red'">{{ current.status === "active" ? "正常" : "已禁用" }}</AdminBadge>
        </div>
        <dl style="margin: 0 0 16px; display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; font-size: 13px">
          <dt style="color: #9a9a9a">邮箱</dt><dd style="margin: 0">{{ current.email || "-" }}</dd>
          <dt style="color: #9a9a9a">等级</dt><dd style="margin: 0">Lv.{{ current.level }}（经验 {{ current.exp }}）</dd>
          <dt style="color: #9a9a9a">注册时间</dt><dd style="margin: 0">{{ new Date(current.createdAt).toLocaleString() }}</dd>
        </dl>
        <h4 style="margin: 0 0 8px; font-size: 13px">最近委托</h4>
        <ul v-if="currentPosts.length" style="margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px">
          <li v-for="p in currentPosts" :key="p.id">
            <NuxtLink :to="`/post/${p.id}`" style="color: #e8e8e8; text-decoration: none; font-size: 13px">{{ p.title }}</NuxtLink>
          </li>
        </ul>
        <div v-else style="color: #666; font-size: 12px">暂无委托</div>
      </template>
    </AdminDrawer>
  </div>
</template>
