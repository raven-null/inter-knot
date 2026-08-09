<script setup lang="ts">
/**
 * PostMediaCarousel —— 帖子媒体统一轮播：图片与视频合并为一个可左右滑动的轮播。
 * 图片与视频按顺序排列（先图片后视频），支持左右切换按钮、圆点指示、计数，
 * 视频随滑到即渲染（懒加载，接近时才创建 iframe）。
 */
import EmblaCarousel from "embla-carousel";
import type { EmblaCarouselType } from "embla-carousel";
import { computed, ref, shallowRef, watch } from "vue";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/vue/24/outline";
import type { CoverImage, ExternalVideo } from "~/types/entities";
import { toCanonicalUrl } from "~/utils/image";
import BilibiliPlayer from "~/components/BilibiliPlayer.vue";

const DEFAULT_COVER_IMAGE = "/images/default-cover.webp";

const props = withDefaults(defineProps<{
  covers: CoverImage[];
  videos?: ExternalVideo[];
  /** 图片点击放大（打开灯箱） */
  onImageClick?: (index: number) => void;
}>(), {
  videos: () => [],
  onImageClick: undefined,
});

interface MediaItem {
  kind: "image" | "video";
  /** 图片用 */
  cover?: CoverImage;
  /** 视频用 */
  video?: ExternalVideo;
}

// 合并为统一媒体列表：先图片后视频
const mediaItems = computed<MediaItem[]>(() => {
  const items: MediaItem[] = [];
  for (const c of props.covers) {
    if (c?.url) items.push({ kind: "image", cover: c });
  }
  for (const v of props.videos || []) {
    if (v?.embedUrl) items.push({ kind: "video", video: v });
  }
  return items;
});

const total = computed(() => mediaItems.value.length);
const hasMultiple = computed(() => total.value > 1);

const aspectRatio = computed(() => {
  const first = props.covers[0];
  if (first?.width && first?.height && first.width > 0 && first.height > 0) {
    return first.width / first.height;
  }
  return 16 / 9;
});

// ── Embla 轮播 ───────────────────────────────
const mediaIndex = ref(0);
const emblaRef = shallowRef<HTMLElement | null>(null);
const emblaApi = shallowRef<EmblaCarouselType | undefined>();

const syncState = () => {
  const api = emblaApi.value;
  if (!api) return;
  mediaIndex.value = api.selectedScrollSnap();
  expandLoadWindow();
};

const destroyEmbla = () => {
  if (emblaApi.value) {
    emblaApi.value.destroy();
    emblaApi.value = undefined;
  }
};

const initEmbla = (el: HTMLElement) => {
  destroyEmbla();
  emblaApi.value = EmblaCarousel(el, {
    loop: false,
    align: "start",
    dragThreshold: 6,
  });
  emblaApi.value.on("select", syncState);
  emblaApi.value.on("reInit", syncState);
  syncState();
};

watch(emblaRef, (el, _, onCleanup) => {
  if (el) initEmbla(el);
  onCleanup(() => destroyEmbla());
}, { flush: "post" });

// 懒加载窗口：接近当前项的媒体才渲染（视频 iframe 只在滑到附近才创建，省流量）
const loadedIndices = ref<Set<number>>(new Set([0, 1, 2]));
const LOAD_RADIUS = 2;

const expandLoadWindow = () => {
  const i = mediaIndex.value;
  if (total.value === 0) return;
  const next = new Set(loadedIndices.value);
  let changed = false;
  for (let k = i - LOAD_RADIUS; k <= i + LOAD_RADIUS; k++) {
    if (k >= 0 && k < total.value && !next.has(k)) {
      next.add(k);
      changed = true;
    }
  }
  if (changed) loadedIndices.value = next;
};

const isNearby = (i: number) => i === mediaIndex.value || loadedIndices.value.has(i);

const goTo = (index: number) => {
  const api = emblaApi.value;
  if (!api || total.value <= 1) return;
  const target = Math.min(Math.max(index, 0), total.value - 1);
  api.scrollTo(target);
};

const onMediaClick = (item: MediaItem, i: number) => {
  if (item.kind === "image") {
    props.onImageClick?.(i);
  }
};

// 媒体变化后重建轮播
watch(mediaItems, () => {
  mediaIndex.value = 0;
  loadedIndices.value = new Set([0, 1, 2]);
  nextTick(() => {
    emblaApi.value?.reInit();
    expandLoadWindow();
  });
});
</script>

<template>
  <div
    class="ik-media-carousel"
    :style="{ aspectRatio: String(aspectRatio) }"
  >
    <!-- 单媒体直接展示 -->
    <template v-if="!hasMultiple">
      <template v-if="mediaItems[0]?.kind === 'image'">
        <img
          :src="mediaItems[0].cover ? toCanonicalUrl(mediaItems[0].cover.url) : DEFAULT_COVER_IMAGE"
          :alt="mediaItems[0].cover ? '图片' : ''"
          class="ik-media-carousel__img"
          loading="eager"
          decoding="async"
          @click="onMediaClick(mediaItems[0]!, 0)"
        />
      </template>
      <BilibiliPlayer v-else-if="mediaItems[0]?.kind === 'video'" :video="mediaItems[0].video!" />
    </template>

    <!-- 多媒体轮播 -->
    <template v-else>
      <div class="ik-media-carousel__scroller" ref="emblaRef">
        <div class="ik-media-carousel__track">
          <div
            v-for="(item, i) in mediaItems"
            :key="i"
            class="ik-media-carousel__slide"
          >
            <img
              v-if="item.kind === 'image' && isNearby(i)"
              :src="item.cover ? toCanonicalUrl(item.cover.url) : DEFAULT_COVER_IMAGE"
              :alt="`媒体 ${i + 1}`"
              class="ik-media-carousel__img"
              :loading="isNearby(i) ? 'eager' : 'lazy'"
              decoding="async"
              draggable="false"
              @click="onMediaClick(item, i)"
            />
            <BilibiliPlayer v-else-if="item.kind === 'video' && isNearby(i)" :video="item.video!" />
          </div>
        </div>
      </div>

      <button
        v-show="mediaIndex > 0"
        type="button"
        class="ik-media-carousel__nav ik-media-carousel__nav--prev"
        aria-label="上一个媒体"
        @click.stop="goTo(mediaIndex - 1)"
      >
        <ChevronLeftIcon style="width:20px;height:20px" />
      </button>
      <button
        v-show="mediaIndex < total - 1"
        type="button"
        class="ik-media-carousel__nav ik-media-carousel__nav--next"
        aria-label="下一个媒体"
        @click.stop="goTo(mediaIndex + 1)"
      >
        <ChevronRightIcon style="width:20px;height:20px" />
      </button>

      <div class="ik-media-carousel__dots">
        <button
          v-for="(_, i) in mediaItems"
          :key="i"
          type="button"
          class="ik-media-carousel__dot"
          :class="{ 'is-active': i === mediaIndex }"
          :aria-label="`第 ${i + 1} 项`"
          :aria-current="i === mediaIndex ? 'true' : undefined"
          @click.stop="goTo(i)"
        />
      </div>

      <span class="ik-media-carousel__count">{{ mediaIndex + 1 }} / {{ total }}</span>
    </template>
  </div>
</template>

<style scoped>
.ik-media-carousel {
  position: relative;
  width: 100%;
  border-radius: 12px;
  border: 4px solid #313132;
  overflow: hidden;
  background: #0a0a0a;
}

.ik-media-carousel__scroller {
  position: absolute;
  inset: 0;
  overflow: hidden;
  user-select: none;
  -webkit-user-select: none;
}

.ik-media-carousel__track {
  display: flex;
  height: 100%;
  touch-action: pan-y pinch-zoom;
}

.ik-media-carousel__slide {
  position: relative;
  flex: 0 0 100%;
  width: 100%;
  height: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ik-media-carousel__img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  cursor: var(--ik-cursor-pointer);
}

.ik-media-carousel__nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  cursor: var(--ik-cursor-pointer);
  transition: background 160ms ease, opacity 160ms ease;
  z-index: 2;
}

.ik-media-carousel__nav:hover {
  background: rgba(0, 0, 0, 0.75);
}

.ik-media-carousel__nav--prev {
  left: 10px;
}

.ik-media-carousel__nav--next {
  right: 10px;
}

.ik-media-carousel__dots {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  z-index: 2;
}

.ik-media-carousel__dot {
  appearance: none;
  border: none;
  padding: 0;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.45);
  cursor: var(--ik-cursor-pointer);
  transition: width 200ms ease, background-color 200ms ease, transform 160ms ease;
}

.ik-media-carousel__dot:hover {
  background: rgba(255, 255, 255, 0.8);
  transform: scale(1.2);
}

.ik-media-carousel__dot.is-active {
  width: 18px;
  background: var(--ik-primary, #bfff09);
}

.ik-media-carousel__count {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 2px 10px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  pointer-events: none;
  z-index: 2;
}
</style>
