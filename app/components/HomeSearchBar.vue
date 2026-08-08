<script setup lang="ts">
import { useDebounceFn } from "@vueuse/core";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/vue/24/outline";
import type { SearchSuggestion } from "~/composables/useApi";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: "update:open", v: boolean): void }>();

const api = useApi();
const route = useRoute();
const router = useRouter();

const keyword = ref(pickFirstQuery(route.query.q as string | string[] | undefined));
const suggestions = ref<SearchSuggestion[]>([]);
const suggestVisible = ref(false);
const inputRef = ref<HTMLInputElement | null>(null);
let suggestSeq = 0;
let suggestTimer: ReturnType<typeof setTimeout> | null = null;

const suggestOpen = computed(
  () => suggestVisible.value && suggestions.value.length > 0 && !!keyword.value.trim(),
);

const close = () => {
  emit("update:open", false);
};

const search = async () => {
  const q = keyword.value.trim();
  close();
  await router.push({ path: "/", query: q ? { q } : {} });
};

const selectSuggestion = (s: SearchSuggestion) => {
  keyword.value = s.title;
  void search();
};

const onInput = () => {
  const k = keyword.value.trim();
  if (suggestTimer) clearTimeout(suggestTimer);
  suggestSeq += 1;
  if (!k) {
    suggestions.value = [];
    suggestVisible.value = false;
    return;
  }
  const seq = suggestSeq;
  suggestTimer = setTimeout(async () => {
    try {
      const list = await api.suggestArticles(k);
      if (seq !== suggestSeq) return;
      suggestions.value = list;
      suggestVisible.value = true;
    } catch {
      if (seq === suggestSeq) suggestions.value = [];
    }
  }, 200);
};

const clearKeyword = () => {
  keyword.value = "";
  suggestions.value = [];
  suggestVisible.value = false;
  inputRef.value?.focus();
};

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === "Enter") {
    e.preventDefault();
    void search();
  } else if (e.key === "Escape") {
    close();
  }
};

watch(
  () => props.open,
  (v) => {
    if (v) {
      keyword.value = pickFirstQuery(route.query.q as string | string[] | undefined);
      nextTick(() => inputRef.value?.focus());
    } else {
      suggestions.value = [];
      suggestVisible.value = false;
    }
  },
);
</script>

<template>
  <Transition name="ik-home-search">
    <div v-if="open" class="ik-home-search" @mousedown.self="close">
      <div class="ik-home-search__box">
        <MagnifyingGlassIcon class="ik-home-search__icon" aria-hidden="true" />
        <input
          ref="inputRef"
          v-model="keyword"
          class="ik-home-search__input"
          type="text"
          placeholder="搜索委托…"
          aria-label="搜索委托"
          @input="onInput"
          @keydown="onKeydown"
        />
        <button
          v-if="keyword"
          type="button"
          class="ik-home-search__clear"
          aria-label="清除"
          @click="clearKeyword"
        >
          <XMarkIcon class="ik-home-search__clear-icon" aria-hidden="true" />
        </button>
        <button type="button" class="ik-home-search__submit" @click="search">搜索</button>
      </div>

      <Transition name="ik-suggest">
        <div v-if="suggestOpen" class="ik-home-search__suggest" role="listbox">
          <button
            v-for="s in suggestions"
            :key="s.documentId"
            type="button"
            class="ik-home-search__suggest-item"
            role="option"
            @mousedown.prevent
            @click="selectSuggestion(s)"
          >
            <span class="ik-home-search__suggest-title">{{ s.title }}</span>
            <span v-if="s.categoryName" class="ik-home-search__suggest-category">{{ s.categoryName }}</span>
          </button>
        </div>
      </Transition>
    </div>
  </Transition>
</template>

<style scoped>
.ik-home-search {
  position: relative;
  display: flex;
  justify-content: flex-end;
}

.ik-home-search__box {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  width: min(460px, 100%);
  padding: 8px 8px 8px 14px;
  background: #181818;
  border: 1px solid #2d2d2d;
  border-radius: 999px;
  transition: border-color 160ms;
}

.ik-home-search__box:focus-within {
  border-color: var(--ik-primary, #bfff09);
}

.ik-home-search__icon {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.5);
}

.ik-home-search__input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  outline: none;
  color: #e8e8e8;
  font-size: 14px;
  font-family: inherit;
}

.ik-home-search__input::placeholder {
  color: rgba(255, 255, 255, 0.35);
}

.ik-home-search__clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.55);
  cursor: pointer;
  flex-shrink: 0;
}

.ik-home-search__clear:hover {
  color: #fff;
}

.ik-home-search__clear-icon {
  width: 15px;
  height: 15px;
}

.ik-home-search__submit {
  flex-shrink: 0;
  padding: 6px 16px;
  border: none;
  border-radius: 999px;
  background: var(--ik-primary, #bfff09);
  color: #000;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 150ms;
}

.ik-home-search__submit:hover {
  background: #d0ff3f;
}

.ik-home-search__submit:active {
  transform: scale(0.96);
}

.ik-home-search__suggest {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: min(460px, 100%);
  max-height: 320px;
  overflow-y: auto;
  background: #161616;
  border: 1px solid #2d2d2d;
  border-radius: 12px 12px 0 12px;
  padding: 6px;
  z-index: 40;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
}

.ik-home-search__suggest-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 9px 12px;
  border: none;
  background: transparent;
  border-radius: 8px;
  color: #e8e8e8;
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}

.ik-home-search__suggest-item:hover {
  background: rgba(191, 255, 9, 0.1);
}

.ik-home-search__suggest-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ik-home-search__suggest-category {
  flex-shrink: 0;
  color: var(--ik-primary, #bfff09);
  font-size: 12px;
}

.ik-home-search-enter-active,
.ik-home-search-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.ik-home-search-enter-from,
.ik-home-search-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.ik-suggest-enter-active,
.ik-suggest-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}

.ik-suggest-enter-from,
.ik-suggest-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 768px) {
  .ik-home-search__box {
    width: 100%;
  }
}
</style>
