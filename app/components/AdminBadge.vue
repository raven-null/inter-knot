<script setup lang="ts">
defineProps<{ tone?: "green" | "yellow" | "red" | "gray" | "blue" }>();
</script>

<template>
  <span class="ik-admin-badge" :class="`ik-admin-badge--${tone || 'gray'}`">
    <slot />
  </span>
</template>
