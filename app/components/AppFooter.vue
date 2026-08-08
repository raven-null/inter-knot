<template>
  <footer class="app-footer">
    <div class="app-footer__inner">
      <div class="app-footer__brand">
        <span class="app-footer__logo">InterKnot</span>
        <span class="app-footer__copy">&copy; {{ year }} 新艾利都最大的匿名帖子中枢。</span>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
const year = new Date().getFullYear();
</script>

<style scoped>
.app-footer {
  width: 100%;
  background: #0d0d0d;
  border-top: 1px solid #1e1e1e;
  color: #999;
  font-size: 14px;
  line-height: 1.6;
}

.app-footer__inner {
  width: min(1200px, calc(100% - 40px));
  margin: 0 auto;
  display: flex;
  justify-content: flex-start;
  align-items: flex-start;
  padding: 48px 0 32px;
}

.app-footer__brand {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.app-footer__logo {
  font-size: 20px;
  font-weight: 800;
  color: #fff;
  letter-spacing: 0.5px;
}

.app-footer__copy {
  font-size: 12px;
  color: #666;
}

@media (max-width: 640px) {
  .app-footer__inner {
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
    padding: 28px 0 calc(24px + env(safe-area-inset-bottom, 0px));
  }
}
</style>
