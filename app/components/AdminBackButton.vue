<script setup lang="ts">
const router = useRouter();

const goBack = () => {
  if (import.meta.client && window.history.length > 1) {
    router.back();
  } else {
    router.push("/admin");
  }
};
</script>

<template>
  <button type="button" class="ik-admin-btn ik-admin-back" aria-label="返回概览" @click="goBack">
    返回
  </button>
</template>

<style scoped>
.ik-admin-back {
  flex-shrink: 0;
  background: #d32f2f;
  border-color: #d32f2f;
  color: #111;
  font-weight: 700;
}

.ik-admin-back:hover {
  background: #e0403f;
  border-color: #e0403f;
}
</style>
