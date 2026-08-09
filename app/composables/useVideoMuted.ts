/**
 * useVideoMuted —— 打开帖子时自动静音播放视频的偏好（模块级单例）。
 *
 * - 从 `/api/me/profile` 读取 `videoAutoplayMuted`（默认 true）。
 * - 提供 `value` 供播放器组件读取，`update()` 持久化到后端。
 * - 未登录时使用默认值（静音播放）。
 */
import { computed } from "vue";

const DEFAULT_MUTED = true;

let loaded = false;
const state = ref<boolean>(DEFAULT_MUTED);

export function useVideoMuted() {
  const api = useApi();

  const load = async () => {
    if (!import.meta.client || loaded) return;
    loaded = true;
    try {
      const settings = await api.getMyProfileSettings();
      state.value = settings.videoAutoplayMuted;
    } catch {
      state.value = DEFAULT_MUTED;
    }
  };

  const update = async (muted: boolean) => {
    const prev = state.value;
    state.value = muted; // 乐观更新
    try {
      const res = await api.updateMyVideoMuted(muted);
      state.value = res.videoAutoplayMuted;
    } catch {
      state.value = prev;
      throw new Error("保存失败");
    }
  };

  return {
    value: computed(() => state.value),
    load,
    update,
  };
}
