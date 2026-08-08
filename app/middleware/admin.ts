export default defineNuxtRouteMiddleware(() => {
  const auth = useAuthStore();
  // 未登录直接回首页
  if (!auth.isLogin) return navigateTo("/");
  // 已加载用户信息但非管理员
  if (auth.user && !auth.user.isAdmin) return navigateTo("/");
  // 已登录但用户信息尚未加载完成：放行，由 admin 布局内再次校验兜底
});
