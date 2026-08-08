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
};

const toggleBan = async (u: any) => {
  const next = u.status === "active" ? "banned" : "active";
  await admin.updateUser(u.documentId, { status: next });
  u.status = next;
};

onMounted(load);
</script>

<template>
  <div class="ik-admin-page">
    <div class="ik-admin-toolbar">
      <input
        v-model="keyword"
        class="ik-admin-input"
        placeholder="搜索用户名 / 昵称 / 邮箱"
        @keyup.enter="doSearch"
      />
      <button class="ik-admin-btn ik-admin-btn--primary" @click="doSearch">搜索</button>
    </div>

    <div class="ik-admin-card">
      <div v-if="loading" class="ik-admin-loading">加载中…</div>
      <table v-else class="ik-admin-table">
        <thead>
          <tr>
            <th>用户</th>
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
                <NuxtLink :to="`/profile/${u.documentId}`" style="color: inherit; text-decoration: none">
                  {{ u.name }}
                </NuxtLink>
              </div>
            </td>
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
              <span class="ik-admin-badge" :class="u.status === 'active' ? 'ik-admin-badge--green' : 'ik-admin-badge--red'">
                {{ u.status === "active" ? "正常" : "已禁用" }}
              </span>
            </td>
            <td>{{ new Date(u.createdAt).toLocaleString() }}</td>
            <td>
              <button class="ik-admin-btn ik-admin-btn--danger" @click="toggleBan(u)">
                {{ u.status === "active" ? "禁用" : "解禁" }}
              </button>
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
    </div>
  </div>
</template>
