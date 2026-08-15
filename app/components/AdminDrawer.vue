<script setup lang="ts">
const props = defineProps<{ open: boolean; title?: string; width?: string }>();
const emit = defineEmits<{ (e: "close"): void }>();

/**
 * 抽屉面板宽度：桌面用传入的固定宽度；窄屏（<640px）收为近全屏，
 * 避免 440px 固定宽在手机上溢出/挤压。内联 style 只写桌面宽度，
 * 移动端约束由 CSS media query 兜底。
 */
const panelStyle = (): Record<string, string> => {
  const style: Record<string, string> = {};
  if (props.width) style.width = props.width;
  return style;
};
</script>

<template>
  <Teleport to="body">
    <Transition name="ik-admin-drawer">
      <div v-if="open" class="ik-admin-drawer" @mousedown.self="emit('close')">
        <div class="ik-admin-drawer__panel" :style="panelStyle()">
          <header class="ik-admin-drawer__head">
            <h3 class="ik-admin-drawer__title">{{ title }}</h3>
            <button type="button" class="ik-admin-drawer__close" aria-label="关闭" @click="emit('close')">✕</button>
          </header>
          <div class="ik-admin-drawer__body">
            <slot />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ik-admin-drawer {
  position: fixed;
  inset: 0;
  z-index: 900;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(3px);
}

.ik-admin-drawer__panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  background: #121212;
  border-left: 1px solid #2d2d2d;
  box-shadow: -12px 0 32px rgba(0, 0, 0, 0.5);
}

/* 窄屏：抽屉占满可用宽度（保留 12px 边缘，便于点遮罩关闭） */
@media (max-width: 640px) {
  .ik-admin-drawer__panel {
    width: calc(100vw - 12px) !important;
  }
}

.ik-admin-drawer__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid #232323;
}

.ik-admin-drawer__title {
  margin: 0;
  font-size: 15px;
  font-weight: 900;
  letter-spacing: 0.03em;
}

.ik-admin-drawer__close {
  border: none;
  background: transparent;
  color: #9a9a9a;
  font-size: 16px;
  cursor: pointer;
}

.ik-admin-drawer__close:hover {
  color: #fff;
}

.ik-admin-drawer__body {
  flex: 1;
  overflow-y: auto;
  padding: 18px 20px;
}

.ik-admin-drawer-enter-active,
.ik-admin-drawer-leave-active {
  transition: opacity 180ms ease;
}

.ik-admin-drawer-enter-active .ik-admin-drawer__panel,
.ik-admin-drawer-leave-active .ik-admin-drawer__panel {
  transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.ik-admin-drawer-enter-from,
.ik-admin-drawer-leave-to {
  opacity: 0;
}

.ik-admin-drawer-enter-from .ik-admin-drawer__panel,
.ik-admin-drawer-leave-to .ik-admin-drawer__panel {
  transform: translateX(100%);
}
</style>
