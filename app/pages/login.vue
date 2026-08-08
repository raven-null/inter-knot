<script setup lang="ts">
const auth = useAuthStore();
const loginDialog = useLoginDialog();

onMounted(async () => {
  const route = useRoute();
  const code = typeof route.query.code === "string" ? route.query.code : "";
  const state = typeof route.query.state === "string" ? route.query.state : "";

  // GitHub OAuth 回调：验证 state 后交换令牌
  if (code && state) {
    const saved = import.meta.client ? sessionStorage.getItem("github_oauth_state") : null;
    sessionStorage.removeItem("github_oauth_state");
    if (saved && saved === state) {
      try {
        const api = useApi();
        const redirectUri = `${window.location.origin}/login`;
        const res = await api.githubCallback(code, redirectUri);
        if (res.token) {
          auth.setSession(res.token, res.user);
          const id = res.user?.documentId || res.user?.authorId;
          navigateTo(id ? `/profile/${id}` : "/", { replace: true });
          return;
        }
      } catch {
        // 交换失败：回首页并打开登录弹窗
      }
    }
    navigateTo("/", { replace: true });
    loginDialog.open();
    return;
  }

  if (auth.isLogin) {
    const id = auth.user?.documentId || auth.user?.authorId;
    navigateTo(id ? `/profile/${id}` : "/", { replace: true });
  } else {
    loginDialog.open();
    navigateTo("/", { replace: true });
  }
});
</script>

<template>
  <div />
</template>
