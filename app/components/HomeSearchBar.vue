<script setup lang="ts">
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/vue/24/outline";
import type { SearchSuggestion } from "~/composables/useApi";

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

const syncKeyword = () => {
  keyword.value = pickFirstQuery(route.query.q as string | string[] | undefined);
};

const search = async () => {
  const q = keyword.value.trim();
  suggestions.value = [];
  suggestVisible.value = false;
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
    suggestions.value = [];
    suggestVisible.value = false;
    inputRef.value?.blur();
  }
};

watch(
  () => route.query.q,
  () => syncKeyword(),
  { immediate: true },
);
</script>

<template>
  <div class="ik-home-searchbox">
    <div class="ik-home-searchbox__box">
      <MagnifyingGlassIcon class="ik-home-searchbox__icon" aria-hidden="true" />
      <input
        ref="inputRef"
        v-model="keyword"
        class="ik-home-searchbox__input"
        type="text"
        placeholder="搜索委托…"
        aria-label="搜索委托"
        @input="onInput"
        @keydown="onKeydown"
      />
      <button
        v-if="keyword"
        type="button"
        class="ik-home-searchbox__clear"
        aria-label="清除"
        @click="clearKeyword"
      >
        <XMarkIcon class="ik-home-searchbox__clear-icon" aria-hidden="true" />
      </button>
      <button type="button" class="ik-home-searchbox__submit" @click="search">搜索</button>
    </div>

    <Transition name="ik-suggest">
      <div v-if="suggestOpen" class="ik-home-searchbox__suggest" role="listbox">
        <button
          v-for="s in suggestions"
          :key="s.documentId"
          type="button"
          class="ik-home-searchbox__suggest-item"
          role="option"
          @mousedown.prevent
          @click="selectSuggestion(s)"
        >
          <span class="ik-home-searchbox__suggest-title">{{ s.title }}</span>
          <span v-if="s.categoryName" class="ik-home-searchbox__suggest-category">{{ s.categoryName }}</span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.ik-home-searchbox {
  position: relative;
}

.ik-home-searchbox__box {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 280px;
  padding: 6px 6px 6px 12px;
  background: #181818;
  border: 1px solid #2d2d2d;
  border-radius: 999px;
  transition: border-color 160ms;
}

.ik-home-searchbox__box:focus-within {
  border-color: var(--ik-primary, #bfff09);
}

.ik-home-searchbox__icon {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.5);
}

.ik-home-searchbox__input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  outline: none;
  color: #e8e8e8;
  font-size: 13px;
  font-family: inherit;
}

.ik-home-searchbox__input::placeholder {
  color: rgba(255, 255, 255, 0.35);
}

.ik-home-searchbox__clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.55);
  cursor: pointer;
  flex-shrink: 0;
}

.ik-home-searchbox__clear:hover {
  color: #fff;
}

.ik-home-searchbox__clear-icon {
  width: 14px;
  height: 14px;
}

.ik-home-searchbox__submit {
  flex-shrink: 0;
  padding: 6px 14px;
  border: none;
  border-radius: 999px;
  background: var(--ik-primary, #bfff09);
  color: #000;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 150ms;
}

.ik-home-searchbox__submit:hover {
  background: #d0ff3f;
}

.ik-home-searchbox__submit:active {
  transform: scale(0.96);
}

.ik-home-searchbox__suggest {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: 280px;
  max-height: 320px;
  overflow-y: auto;
  background: #161616;
  border: 1px solid #2d2d2d;
  border-radius: 12px 12px 0 12px;
  padding: 6px;
  z-index: 40;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
}

.ik-home-searchbox__suggest-item {
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

.ik-home-searchbox__suggest-item:hover {
  background: rgba(191, 255, 9, 0.1);
}

.ik-home-searchbox__suggest-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ik-home-searchbox__suggest-category {
  flex-shrink: 0;
  color: var(--ik-primary, #bfff09);
  font-size: 12px;
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
  .ik-home-searchbox__box {
    width: 200px;
  }
  .ik-home-searchbox__suggest {
    width: 200px;
  }
}
</style>
