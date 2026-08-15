<script setup lang="ts">
import { useMessage } from "zenless-ui";
import { resolveErrorMessage } from "~/utils/api-error";

definePageMeta({ layout: "admin", middleware: "admin" });

const admin = useAdminApi();
const api = useApi();
const message = useMessage();
const list = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const keyword = ref("");
const loading = ref(false);

const drawerOpen = ref(false);
const current = ref<any>(null);
const currentPosts = ref<any[]>([]);

// 添加用户相关
const addUserDialogOpen = ref(false);
const newUser = ref({
  name: "",
  username: "",
  uid: "",
});
const addUserLoading = ref(false);

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

const changeLevel = async (u: any, level: number) => {
  await admin.updateUser(u.documentId, { level });
  message.success(`已将「${u.name}」设为 Lv.${level}`);
  await load();
  const fresh = list.value.find((x) => x.documentId === u.documentId);
  if (fresh) {
    u.level = fresh.level;
    u.exp = fresh.exp;
    if (current.value?.documentId === u.documentId) {
      current.value.level = fresh.level;
      current.value.exp = fresh.exp;
    }
  }
};

const toggleBan = async (u: any) => {
  const next = u.status === "active" ? "banned" : "active";
  await admin.updateUser(u.documentId, { status: next });
  u.status = next;
  if (current.value?.documentId === u.documentId) current.value.status = next;
};

const confirmDialog = useConfirmDialog();
const deletingId = ref<string | null>(null);

const deleteUser = async (u: any) => {
  if (deletingId.value) return;
  const ok = await confirmDialog.open({
    title: "删除用户",
    message: `确定要彻底删除用户「${u.name}」吗？其帖子、评论、绑定与账号将一并删除，此操作不可恢复。`,
    confirmText: "删除",
    danger: true,
  });
  if (!ok) return;
  deletingId.value = u.documentId;
  try {
    await admin.deleteUser(u.documentId);
    list.value = list.value.filter((x) => x.documentId !== u.documentId);
    if (current.value?.documentId === u.documentId) drawerOpen.value = false;
    message.success("用户已删除");
  } catch (err) {
    message.error(resolveErrorMessage(err, "删除用户失败"));
  } finally {
    deletingId.value = null;
  }
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

const openAddUserDialog = () => {
  newUser.value = { name: "", username: "", uid: "" };
  addUserDialogOpen.value = true;
};

const addUser = async () => {
  if (!newUser.value.name.trim()) {
    message.error("请输入用户名");
    return;
  }
  addUserLoading.value = true;
  try {
    await admin.createUser({
      name: newUser.value.name.trim(),
      username: newUser.value.username.trim() || undefined,
      uid: newUser.value.uid ? Number(newUser.value.uid) : undefined,
    });
    message.success("用户创建成功");
    addUserDialogOpen.value = false;
    await load();
  } catch (err) {
    message.error(resolveErrorMessage(err, "创建用户失败"));
  } finally {
    addUserLoading.value = false;
  }
};

onMounted(load);
</script>

<template>
  <div class="ik-admin-page">
    <div class="ik-admin-toolbar">
      <AdminBackButton />
      <input
        v-model="keyword"
        class="ik-admin-input"
        placeholder="搜索 UID / 用户名 / 昵称"
        @keyup.enter="doSearch"
      />
      <button class="ik-admin-btn ik-admin-btn--primary" @click="doSearch">搜索</button>
      <button class="ik-admin-btn ik-admin-btn--primary" @click="openAddUserDialog">添加用户</button>
    </div>

    <AdminCard>
      <div v-if="loading" class="ik-admin-loading">加载中…</div>
      <div v-else class="ik-admin-table-scroll">
        <table class="ik-admin-table">
        <thead>
          <tr>
            <th>用户</th>
            <th>UID</th>
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
            <td>
              <select
                class="ik-admin-input"
                style="min-width: 0; padding: 4px 8px"
                :value="u.level"
                @change="changeLevel(u, Number(($event.target as HTMLSelectElement).value))"
              >
                <option v-for="lv in 7" :key="lv" :value="lv">Lv.{{ lv }}</option>
              </select>
            </td>
            <td>
              <select
                class="ik-admin-input"
                style="min-width: 0; padding: 4px 8px"
                :value="u.role"
                @change="changeRole(u, ($event.target as HTMLSelectElement).value)"
              >
                <option value="user">用户</option>
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
                <button class="ik-admin-btn ik-admin-btn--danger" :disabled="deletingId === u.documentId" @click="deleteUser(u)">
                  {{ deletingId === u.documentId ? "删除中…" : "删除" }}
                </button>
              </div>
            </td>
          </tr>
        </tbody>
        </table>
      </div>
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
          <dt style="color: #9a9a9a">等级</dt>
          <dd style="margin: 0; display: flex; align-items: center; gap: 8px">
            <select
              class="ik-admin-input"
              style="min-width: 0; padding: 2px 6px; font-size: 13px"
              :value="current.level"
              @change="changeLevel(current, Number(($event.target as HTMLSelectElement).value))"
            >
              <option v-for="lv in 7" :key="lv" :value="lv">Lv.{{ lv }}</option>
            </select>
            <span style="color: #9a9a9a; font-size: 12px">经验 {{ current.exp }}</span>
          </dd>
          <dt style="color: #9a9a9a">注册时间</dt><dd style="margin: 0">{{ new Date(current.createdAt).toLocaleString() }}</dd>
        </dl>
        <h4 style="margin: 0 0 8px; font-size: 13px">最近帖子</h4>
        <ul v-if="currentPosts.length" style="margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px">
          <li v-for="p in currentPosts" :key="p.id">
            <NuxtLink :to="`/post/${p.id}`" style="color: #e8e8e8; text-decoration: none; font-size: 13px">{{ p.title }}</NuxtLink>
          </li>
        </ul>
        <div v-else style="color: #666; font-size: 12px">暂无帖子</div>
      </template>
    </AdminDrawer>

    <!-- 添加用户弹窗 -->
    <Teleport to="body">
      <Transition name="ik-overlay" appear>
        <div v-if="addUserDialogOpen" class="ik-overlay" @mousedown.self="addUserDialogOpen = false">
          <div class="ik-overlay__stripe" aria-hidden="true"></div>
          <div class="ik-add-user-dialog" @click.stop>
            <div class="ik-add-user-dialog__outer">
              <div class="ik-add-user-dialog__inner">
                <div class="ik-add-user-dialog__header">
                  <span class="ik-add-user-dialog__title">添加用户</span>
                  <button class="ik-dialog__close" aria-label="关闭" @click="addUserDialogOpen = false">
                    <img src="/images/close-btn.webp" alt="关闭" class="ik-dialog__close-img" draggable="false" />
                  </button>
                </div>
                <div class="ik-add-user-dialog__body">
                  <div class="ik-add-user-dialog__field">
                    <label class="ik-add-user-dialog__label">用户名 *</label>
                    <input
                      v-model="newUser.name"
                      class="ik-admin-input"
                      placeholder="请输入用户名"
                    />
                  </div>
                  <div class="ik-add-user-dialog__field">
                    <label class="ik-add-user-dialog__label">昵称</label>
                    <input
                      v-model="newUser.username"
                      class="ik-admin-input"
                      placeholder="请输入昵称（可选）"
                    />
                  </div>
                  <div class="ik-add-user-dialog__field">
                    <label class="ik-add-user-dialog__label">UID</label>
                    <input
                      v-model="newUser.uid"
                      class="ik-admin-input"
                      type="number"
                      placeholder="请输入 UID（可选）"
                    />
                  </div>
                  <div class="ik-add-user-dialog__actions">
                    <button class="ik-admin-btn" @click="addUserDialogOpen = false">取消</button>
                    <button
                      class="ik-admin-btn ik-admin-btn--primary"
                      :disabled="addUserLoading || !newUser.name.trim()"
                      @click="addUser"
                    >
                      {{ addUserLoading ? '创建中...' : '创建' }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.ik-add-user-dialog {
  position: relative;
  z-index: 1;
  width: 400px;
  max-width: 92%;
}
.ik-add-user-dialog__outer {
  width: 100%;
  padding: 3px;
  background: #2D2C2D;
  border-radius: 18px 0 18px 18px;
}
.ik-add-user-dialog__inner {
  width: 100%;
  background: #141414;
  border: 3px solid #000;
  border-radius: 16px 0 16px 16px;
}
.ik-add-user-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 12px 24px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.ik-add-user-dialog__title {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
}
.ik-add-user-dialog__body {
  padding: 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ik-add-user-dialog__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ik-add-user-dialog__label {
  font-size: 13px;
  color: rgba(255,255,255,0.7);
}
.ik-add-user-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
</style>
