<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { PaperAirplaneIcon, StopIcon, AtSymbolIcon, FaceSmileIcon, PhotoIcon, FilmIcon } from "@heroicons/vue/24/solid";

const props = defineProps<{
  disabled: boolean;
  placeholder: string;
  sending: boolean;
  editing: boolean;
  error: string | null;
  streaming: boolean;
  stopping: boolean;
  /** @ 提及是否达到上限 */
  mentionAtLimit?: boolean;
  /** 表情是否达到上限 */
  emoteAtLimit?: boolean;
}>();

const emit = defineEmits<{
  (e: "send"): void;
  (e: "stop"): void;
  (e: "cancel-edit"): void;
  (e: "typing"): void;
  (e: "insert-mention"): void;
  (e: "toggle-emote"): void;
  (e: "pick-image"): void;
  (e: "insert-bilibili"): void;
}>();

const draft = defineModel<string>("draft", { default: "" });
const editingDraft = defineModel<string>("editingDraft", { default: "" });

const composerRef = ref<HTMLTextAreaElement | null>(null);

const autoGrowComposer = () => {
  const el = composerRef.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
};

watch([draft, editingDraft, () => props.editing], () => {
  nextTick(autoGrowComposer);
});

const activeDraftLength = computed(() =>
  (props.editing ? editingDraft.value : draft.value).length,
);
const showCharCount = computed(() => activeDraftLength.value > 3500);

const sendDisabled = computed(
  () =>
    props.disabled ||
    props.sending ||
    (props.editing ? !editingDraft.value.trim() : !draft.value.trim()),
);
const onComposerInput = () => {
  autoGrowComposer();
  emit("typing");
};

const onComposerKeyDown = (e: KeyboardEvent) => {
  if (e.key !== "Enter") return;
  if (e.shiftKey || e.ctrlKey || e.metaKey) return;
  e.preventDefault();
  emit("send");
};

defineExpose({
  focus: () => composerRef.value?.focus(),
  textarea: composerRef,
  textareaEl: computed(() => composerRef.value),
});
</script>

<template>
  <div class="ik-knock__composer">
    <div v-if="editing" class="ik-knock__composer-edit-banner">
      <span>正在编辑消息</span>
      <button type="button" class="ik-knock__composer-edit-cancel" @click="emit('cancel-edit')">取消</button>
    </div>
    <div v-if="error" class="ik-knock__composer-error" role="alert">{{ error }}</div>
    <div v-if="showCharCount" class="ik-knock__composer-count" :class="{ 'is-danger': activeDraftLength >= 3950 }" aria-live="polite">
      {{ activeDraftLength }}/4000
    </div>
    <div class="ik-knock__composer-row" :class="{ 'is-disabled': disabled }">
      <textarea
        v-if="editing"
        ref="composerRef"
        v-model="editingDraft"
        class="ik-knock__composer-input"
        placeholder="编辑消息…"
        rows="1"
        maxlength="4000"
        :disabled="disabled"
        @keydown="onComposerKeyDown"
        @input="autoGrowComposer"
      />
      <textarea
        v-else
        ref="composerRef"
        v-model="draft"
        class="ik-knock__composer-input"
        :placeholder="placeholder"
        rows="1"
        maxlength="4000"
        :disabled="disabled"
        @keydown="onComposerKeyDown"
        @input="onComposerInput"
      />
      <button
        v-if="streaming && !editing"
        type="button"
        class="ik-knock__composer-send is-stop"
        :disabled="stopping"
        aria-label="停止生成"
        @click="emit('stop')"
      >
        <StopIcon class="ik-knock__composer-send-icon" aria-hidden="true" />
      </button>
      <button
        v-else
        type="button"
        class="ik-knock__composer-send"
        :disabled="sendDisabled"
        :aria-label="editing ? '保存编辑' : '发送'"
        @click="emit('send')"
      >
        <PaperAirplaneIcon class="ik-knock__composer-send-icon" aria-hidden="true" />
      </button>
    </div>
    <!-- 工具栏 -->
    <div v-if="!editing" class="ik-knock__toolbar">
      <button
        type="button"
        class="ik-knock__toolbar-btn"
        aria-label="@ 提及用户"
        :disabled="disabled || mentionAtLimit"
        title="@ 提及用户"
        @click="emit('insert-mention')"
      >
        <AtSymbolIcon class="ik-knock__toolbar-icon" />
      </button>
      <button
        type="button"
        class="ik-knock__toolbar-btn"
        aria-label="插入表情"
        :disabled="disabled || emoteAtLimit"
        title="插入表情"
        @click="emit('toggle-emote')"
      >
        <FaceSmileIcon class="ik-knock__toolbar-icon" />
      </button>
      <button
        type="button"
        class="ik-knock__toolbar-btn"
        aria-label="发送图片"
        :disabled="disabled"
        title="发送图片"
        @click="emit('pick-image')"
      >
        <PhotoIcon class="ik-knock__toolbar-icon" />
      </button>
      <button
        type="button"
        class="ik-knock__toolbar-btn"
        aria-label="发送 B 站视频"
        :disabled="disabled"
        title="发送 B 站视频"
        @click="emit('insert-bilibili')"
      >
        <FilmIcon class="ik-knock__toolbar-icon" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.ik-knock__composer {
  flex-shrink: 0;
  margin-top: auto;
  padding-top: 10px;
  border-top: 2px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ik-knock__composer-edit-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-radius: 8px;
  background: rgba(251, 254, 0, 0.12);
  color: #fbfe00;
  font-size: 12px;
  font-weight: 700;
}

.ik-knock__composer-edit-cancel {
  border: 0;
  background: transparent;
  color: #fbfe00;
  cursor: pointer;
  font: inherit;
  text-decoration: underline;
  padding: 0;
}

.ik-knock__composer-error {
  padding: 6px 12px;
  border-radius: 8px;
  background: rgba(255, 80, 80, 0.15);
  color: #ff8080;
  font-size: 12px;
  font-weight: 600;
}

.ik-knock__composer-count {
  align-self: flex-end;
  padding: 0 8px;
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.45);
}

.ik-knock__composer-count.is-danger {
  color: #ff8080;
}

.ik-knock__composer-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 6px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 14px;
  border: 2px solid rgba(255, 255, 255, 0.08);
  transition: border-color 140ms ease;
}

.ik-knock__composer-row:focus-within {
  border-color: #fbfe00;
}

.ik-knock__composer-row.is-disabled {
  background: rgba(255, 255, 255, 0.02);
  border-color: rgba(255, 255, 255, 0.05);
  cursor: not-allowed;
}

.ik-knock__composer-row.is-disabled .ik-knock__composer-input {
  cursor: not-allowed;
  color: rgba(255, 255, 255, 0.35);
}

.ik-knock__composer-input {
  flex: 1;
  min-height: 36px;
  max-height: min(40vh, 320px);
  padding: 8px 12px;
  border: 0;
  background: transparent;
  color: #fff;
  font-size: 14px;
  font-family: inherit;
  line-height: 1.45;
  resize: none;
  outline: none;
  overflow-y: auto;
}

.ik-knock__composer-input::placeholder {
  color: rgba(255, 255, 255, 0.32);
}

.ik-knock__composer-send {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  background: #fbfe00;
  color: #000;
  cursor: pointer;
  transition: background 140ms ease, transform 100ms ease, opacity 140ms ease;
}

.ik-knock__composer-send:hover:not(:disabled) { background: #e8eb00; }
.ik-knock__composer-send:active:not(:disabled) { transform: scale(0.94); }
.ik-knock__composer-send:disabled {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.3);
  cursor: not-allowed;
}

.ik-knock__composer-send.is-stop { background: #ff5a5a; color: #fff; }
.ik-knock__composer-send.is-stop:hover:not(:disabled) { background: #e64545; }
.ik-knock__composer-send.is-stop:disabled {
  background: rgba(255, 90, 90, 0.35);
  color: rgba(255, 255, 255, 0.6);
}

.ik-knock__composer-send-icon { width: 18px; height: 18px; }

/* ── 工具栏 ── */
.ik-knock__toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 4px;
}

.ik-knock__toolbar-btn {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.45);
  cursor: pointer;
  transition: background 140ms, color 140ms;
}

.ik-knock__toolbar-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
}

.ik-knock__toolbar-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.ik-knock__toolbar-icon {
  width: 18px;
  height: 18px;
}

@media (max-width: 768px) {
  .ik-knock__composer {
    padding-bottom: env(safe-area-inset-bottom);
  }
}
</style>
