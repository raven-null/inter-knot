<script setup lang="ts">
import type { ExternalVideo } from "~/types/entities";
import { computed } from "vue";
import { useVideoMuted } from "~/composables/useVideoMuted";

interface Props {
  video: ExternalVideo;
}

const props = defineProps<Props>();
const { value: videoMuted } = useVideoMuted();

// 打开帖子时按用户偏好自动播放：
// - 开启「自动静音播放」→ iframe 加 autoplay=1&muted=1
// - 关闭 → 维持手动播放（autoplay=0）
const playerSrc = computed(() => {
  if (!props.video.embedUrl) return "";
  const url = new URL(props.video.embedUrl);
  if (videoMuted.value) {
    url.searchParams.set("autoplay", "1");
    url.searchParams.set("muted", "1");
  } else {
    url.searchParams.set("autoplay", "0");
    url.searchParams.delete("muted");
  }
  return url.toString();
});
</script>

<template>
  <div v-if="video.embedUrl" class="ik-bilibili-player">
    <iframe
      :src="playerSrc"
      class="ik-bilibili-player__iframe"
      title="Bilibili video player"
      frameborder="0"
      allowfullscreen
      scrolling="no"
      referrerpolicy="no-referrer"
      allow="autoplay; fullscreen"
      sandbox="allow-same-origin allow-scripts allow-popups"
    ></iframe>
  </div>
</template>

<style scoped>
.ik-bilibili-player {
  position: relative;
  width: 100%;
  padding-top: 56.25%; /* 16:9 */
  border-radius: 8px;
  overflow: hidden;
  background: #000;
}

.ik-bilibili-player__iframe {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: none;
}
</style>
