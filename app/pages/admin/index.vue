<script setup lang="ts">
definePageMeta({ layout: "admin", middleware: "admin" });

const admin = useAdminApi();
const loading = ref(true);
const error = ref("");
const data = ref<Record<string, unknown>>({});

onMounted(async () => {
  try {
    data.value = await admin.stats();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "加载失败";
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="ik-admin-page">
    <div v-if="loading" class="ik-admin-loading">加载中…</div>
    <div v-else-if="error" class="ik-admin-card">
      <p class="ik-admin-empty">加载失败：{{ error }}</p>
    </div>
    <template v-else>
      <div class="ik-admin-grid">
        <div class="ik-admin-stat">
          <span class="ik-admin-stat__label">注册用户</span>
          <span class="ik-admin-stat__value">{{ data.userCount }}</span>
        </div>
        <div class="ik-admin-stat">
          <span class="ik-admin-stat__label">委托总数</span>
          <span class="ik-admin-stat__value">{{ data.postCount }}</span>
        </div>
        <div class="ik-admin-stat">
          <span class="ik-admin-stat__label">评论总数</span>
          <span class="ik-admin-stat__value">{{ data.commentCount }}</span>
        </div>
        <div class="ik-admin-stat">
          <span class="ik-admin-stat__label">总浏览量</span>
          <span class="ik-admin-stat__value">{{ data.viewCount }}</span>
        </div>
        <div class="ik-admin-stat">
          <span class="ik-admin-stat__label">今日新帖</span>
          <span class="ik-admin-stat__value">{{ data.todayPosts }}</span>
        </div>
        <div class="ik-admin-stat">
          <span class="ik-admin-stat__label">今日评论</span>
          <span class="ik-admin-stat__value">{{ data.todayComments }}</span>
        </div>
        <div class="ik-admin-stat">
          <span class="ik-admin-stat__label">待审核</span>
          <span class="ik-admin-stat__value">{{ data.pendingPosts }}</span>
        </div>
        <div class="ik-admin-stat">
          <span class="ik-admin-stat__label">版块数</span>
          <span class="ik-admin-stat__value">{{ data.categoryCount }}</span>
        </div>
      </div>

      <div class="ik-admin-grid" style="grid-template-columns: 1fr 1fr">
        <div class="ik-admin-card">
          <h3 class="ik-admin-card__title">最新注册用户</h3>
          <table class="ik-admin-table">
            <thead>
              <tr>
                <th>用户</th>
                <th>等级</th>
                <th>注册时间</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in (data.recentUsers as any[] || [])" :key="u.documentId">
                <td>
                  <div style="display: flex; align-items: center; gap: 8px">
                    <img :src="u.avatar" class="ik-admin-avatar" alt="" />
                    <span>{{ u.name }}</span>
                  </div>
                </td>
                <td>Lv.{{ u.level }}</td>
                <td>{{ new Date(u.createdAt).toLocaleString() }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="ik-admin-card">
          <h3 class="ik-admin-card__title">最新委托</h3>
          <table class="ik-admin-table">
            <thead>
              <tr>
                <th>标题</th>
                <th>浏览</th>
                <th>点赞</th>
                <th>评论</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in (data.recentPosts as any[] || [])" :key="p.documentId">
                <td style="max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
                  <NuxtLink :to="`/post/${p.documentId}`" style="color: inherit; text-decoration: none">
                    {{ p.title }}
                  </NuxtLink>
                </td>
                <td>{{ p.views }}</td>
                <td>{{ p.likesCount }}</td>
                <td>{{ p.commentsCount }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
