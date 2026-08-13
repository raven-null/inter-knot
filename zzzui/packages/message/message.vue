<template>
  <div :class="['z-message', {
    [`z-message--${type}`]: type
  }]">
    <div class="z-message__content">
      <slot v-if="$slots.default"></slot>
      <span v-else>{{ message }}</span>
    </div>
  </div>
</template>

<script setup>
import { messageTypes } from './constants'

defineOptions({
  name: 'ZMessage'
})

defineProps({
  message: [String, Object],
  type: {
    type: String,
    validator: (v) => messageTypes.includes(v)
  }
})
</script>

<style scoped>
@import './message.scss';
</style>