<script setup lang="ts">
const props = defineProps<{ time?: string }>();

const text = computed(() => {
  if (!props.time) return "-";
  const t = new Date(props.time).getTime();
  if (Number.isNaN(t)) return "-";
  const diff = Date.now() - t;
  if (diff < 60_000) return "刚刚";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  if (diff < 7 * 86400_000) return `${Math.floor(diff / 86400_000)} 天前`;
  return new Date(t).toLocaleDateString();
});
</script>

<template>
  <span>{{ text }}</span>
</template>
