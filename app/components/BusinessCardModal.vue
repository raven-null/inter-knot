<script setup lang="ts">
import { useMessage } from "zenless-ui";
import type { BusinessCard, Profile } from "~/types/entities";
import { resolveErrorMessage } from "~/utils/api-error";
import { toNoResizeWebpUrl } from "~/utils/image";
import { MAX_IMAGE_SIZE } from "~/utils/upload";

const props = defineProps<{
  profile: Profile;
}>();

const emit = defineEmits<{
  close: [];
  equipped: [card: BusinessCard | null];
}>();

const api = useApi();
const message = useMessage();

const cards = ref<BusinessCard[]>([]);
const equippedId = ref<string | null>(null);
const equippedCard = ref<BusinessCard | null>(null);
const selectedCard = ref<BusinessCard | null>(null);
const equipping = ref(false);
const loading = ref(true);
const deletingId = ref<string | null>(null);

// 默认展示当前装备的背景；若尚未装备任何背景则选中第一张（如有）
const previewCard = computed(() => selectedCard.value ?? equippedCard.value ?? cards.value[0] ?? null);

// 上传中的本地预览优先展示，其次展示当前选中/装备的背景
const previewImageUrl = computed(() => uploadPreview.value || previewCard.value?.image || "");

const selectCard = (card: BusinessCard) => {
  selectedCard.value = card;
};

const loadCards = async () => {
  loading.value = true;
  try {
    const result = await api.getMyBusinessCards();
    cards.value = result.cards;
    equippedId.value = result.equippedCardDocumentId;
    equippedCard.value = result.equippedCard;
    if (!equippedId.value && !selectedCard.value && result.cards.length > 0) {
      selectedCard.value = result.cards[0] ?? null;
    }
  } catch (err) {
    message.error(resolveErrorMessage(err, "获取背景列表失败"));
  } finally {
    loading.value = false;
  }
};

const handleEquip = async () => {
  const target = previewCard.value;
  if (!target || equipping.value) return;
  equipping.value = true;
  try {
    await api.equipBusinessCard(target.documentId);
    equippedId.value = target.documentId;
    equippedCard.value = target;
    emit("equipped", target);
    message.success("已使用此背景");
  } catch (err) {
    message.error(resolveErrorMessage(err, "使用背景失败"));
  } finally {
    equipping.value = false;
  }
};

const handleUnequip = async () => {
  if (equipping.value) return;
  equipping.value = true;
  try {
    await api.equipBusinessCard(null);
    equippedId.value = null;
    equippedCard.value = null;
    emit("equipped", null);
    message.success("已卸下背景");
  } catch (err) {
    message.error(resolveErrorMessage(err, "卸下背景失败"));
  } finally {
    equipping.value = false;
  }
};

const handleDelete = async (card: BusinessCard) => {
  if (deletingId.value) return;
  deletingId.value = card.documentId;
  try {
    await api.deleteCustomCard(card.documentId);
    cards.value = cards.value.filter((c) => c.documentId !== card.documentId);
    if (equippedId.value === card.documentId) {
      equippedId.value = null;
      equippedCard.value = null;
      emit("equipped", null);
    }
    if (selectedCard.value?.documentId === card.documentId) {
      selectedCard.value = null;
    }
    message.success("已删除背景");
  } catch (err) {
    message.error(resolveErrorMessage(err, "删除背景失败"));
  } finally {
    deletingId.value = null;
  }
};

// ── 背景图上传 + 预览 ──
const fileInputRef = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
const uploadPreview = ref("");

const triggerFileInput = () => {
  fileInputRef.value?.click();
};

const onFileSelected = async (e: Event) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    message.warning("请选择图片文件");
    return;
  }
  if (file.size > MAX_IMAGE_SIZE) {
    message.warning("图片大小不能超过 30MB");
    return;
  }
  // 上传前先展示本地预览，上传完成自动装备
  uploadPreview.value = URL.createObjectURL(file);
  uploading.value = true;
  try {
    const card = await api.uploadCustomCard(file);
    cards.value = [card, ...cards.value.filter((c) => c.documentId !== card.documentId)];
    equippedId.value = card.documentId;
    equippedCard.value = card;
    selectedCard.value = null;
    emit("equipped", card);
    message.success("背景上传成功");
  } catch (err) {
    message.error(resolveErrorMessage(err, "上传背景失败"));
  } finally {
    uploading.value = false;
    setTimeout(() => URL.revokeObjectURL(uploadPreview.value), 1000);
    uploadPreview.value = "";
  }
};

const handleClose = () => {
  emit("close");
};

const handleOverlayClick = (e: MouseEvent) => {
  if ((e.target as HTMLElement).classList.contains("ik-overlay")) {
    handleClose();
  }
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === "Escape") handleClose();
};

// 锁住 body 滚动，避免弹窗打开时滚轮事件穿透到下方页面
const { acquire, release } = useBodyScrollLock();
const SCROLL_LOCK_TOKEN = Symbol("business-card-modal");

onMounted(async () => {
  window.addEventListener("keydown", handleKeydown);
  acquire(SCROLL_LOCK_TOKEN);
  await loadCards();
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown);
  release(SCROLL_LOCK_TOKEN);
});
</script>

<template>
  <div class="ik-overlay" @click="handleOverlayClick">
    <div class="ik-overlay__stripe" />
    <div class="ik-bc-dialog">
      <!-- Outer / Inner frame (reuse profile frame style) -->
      <div class="ik-bc-frame">
        <div class="ik-bc-frame__inner">
          <div class="ik-bc-frame__body">

            <!-- Tab Bar -->
            <div class="ik-bc-tab-bar">
              <!-- Title (left) -->
              <span class="ik-bc-title">修改背景</span>

              <!-- Close button (right) -->
              <button class="ik-bc-close" aria-label="关闭" @click="handleClose">
                <img src="/images/close-btn.webp" alt="关闭" class="ik-bc-close__img" draggable="false" />
              </button>
            </div>

            <!-- Main content area -->
            <div class="ik-bc-main">

              <!-- Banner preview (top) -->
              <div class="ik-bc-preview">
                <div v-if="loading" class="ik-bc-preview__banner-card">
                  <div class="ik-skel ik-bc-preview__banner-skel"></div>
                </div>
                <div v-else class="ik-bc-preview__banner-card">
                  <div
                    class="ik-bc-preview__banner"
                    :style="previewImageUrl ? { backgroundImage: `url('${previewImageUrl}')` } : undefined"
                  >
                    <div class="ik-bc-preview__user">
                      <div class="ik-bc-preview__avatar-wrap">
                        <div class="ik-bc-preview__avatar">
                          <img
                            :src="profile.avatar || '/images/default-avatar.webp'"
                            alt=""
                            class="ik-bc-preview__avatar-img"
                            @error="($event.target as HTMLImageElement).src = '/images/default-avatar.webp'"
                          />
                        </div>
                      </div>
                      <div class="ik-bc-preview__info">
                        <h2 class="ik-bc-preview__name">{{ profile.name || profile.login || "匿名用户" }}</h2>
                        <span v-if="profile.bio" class="ik-bc-preview__tag">{{ profile.bio }}</span>
                        <span v-else class="ik-bc-preview__tag ik-bc-preview__tag--empty">暂无简介</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Bottom: background list (left) + upload (right) -->
              <div class="ik-bc-bottom">

                <!-- Background capsule list (left) -->
                <div class="ik-bc-grid-wrap">
                  <div v-if="loading" class="ik-bc-grid-loading">
                    <i class="z-icon-loading ik-spin" /> 加载中...
                  </div>
                  <div v-else-if="!cards.length" class="ik-bc-grid-empty">
                    还没有上传背景，点击右侧上传
                  </div>
                  <Transition name="ik-fade">
                  <z-scrollbar v-if="!loading && cards.length" class="ik-bc-grid-scroll">
                    <div class="ik-bc-grid">
                      <div
                        v-for="card in cards"
                        :key="card.documentId"
                        class="ik-bc-grid__item"
                        :class="{
                          'is-selected': previewCard?.documentId === card.documentId,
                          'is-equipped': equippedId === card.documentId,
                        }"
                        @click="selectCard(card)"
                      >
                        <div class="ik-bc-grid__thumb">
                          <img
                            v-if="card.image"
                            :src="toNoResizeWebpUrl(card.image)"
                            alt=""
                            class="ik-bc-grid__img"
                          />
                        </div>
                        <button
                          type="button"
                          class="ik-bc-grid__delete"
                          aria-label="删除背景"
                          :disabled="deletingId === card.documentId"
                          @click.stop="handleDelete(card)"
                        >×</button>
                        <i v-if="equippedId === card.documentId" class="z-icon-success ik-bc-grid__badge-icon" />
                      </div>
                    </div>
                  </z-scrollbar>
                  </Transition>
                </div>

                <!-- Upload box (right) -->
                <div class="ik-bc-detail">
                  <div class="ik-bc-upload" @click="triggerFileInput">
                    <svg class="ik-bc-upload__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    <span class="ik-bc-upload__text">{{ uploading ? "上传中..." : "上传背景图片" }}</span>
                    <span class="ik-bc-upload__hint">选择图片自动转 WebP 上传</span>
                  </div>
                  <input ref="fileInputRef" type="file" accept="image/*" class="ik-bc-upload__file" @change="onFileSelected" />

                  <div class="ik-bc-detail__actions">
                    <z-button
                      v-if="previewCard && previewCard.documentId !== equippedId"
                      :disabled="equipping || uploading"
                      @click="handleEquip"
                    >
                      {{ equipping ? '使用中...' : '使用背景' }}
                    </z-button>
                    <z-button
                      v-else-if="equippedId"
                      :disabled="equipping || uploading"
                      @click="handleUnequip"
                    >
                      {{ equipping ? '卸下中...' : '卸下背景' }}
                    </z-button>
                  </div>
                </div>

              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Overlay (reuse post overlay pattern) ── */
.ik-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.ik-overlay__stripe {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(
    40deg,
    transparent,
    transparent 3.5px,
    rgba(255, 255, 255, 0.09) 4.5px,
    rgba(255, 255, 255, 0.09) 7.5px,
    transparent 8.5px
  );
}

/* ── Dialog shell ── */
.ik-bc-dialog {
  position: relative;
  width: 70%;
  height: 75%;
  transform: scale(1.1);
  transform-origin: center;
}

/* ── Frame (reuse profile double-border) ── */
.ik-bc-frame {
  width: 100%;
  height: 100%;
  padding: 4px;
  background: #2D2C2D;
  border-radius: 24px;
}
.ik-bc-frame__inner {
  width: 100%;
  height: 100%;
  padding: 4px;
  background: #000;
  border-radius: 22px;
  overflow: hidden;
}
.ik-bc-frame__body {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: transparent;
  border-radius: 20px;
  overflow: hidden;
}

/* ── Tab bar ── */
.ik-bc-tab-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  min-height: 52px;
  flex-shrink: 0;
  border-radius: 0 0 16px 16px;
  background:
    url("/images/tab-bg-point.webp") repeat,
    linear-gradient(180deg, #161616 0%, #080808 100%);
}

/* Close button (left side) */
.ik-bc-close {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: opacity 140ms ease, transform 140ms ease;
}
.ik-bc-close:hover { opacity: 0.85; transform: scale(1.08); }
.ik-bc-close:active { transform: scale(0.95); }
.ik-bc-close__img {
  height: 32px;
  width: auto;
  display: block;
  user-select: none;
  -webkit-user-drag: none;
  pointer-events: none;
}

/* ── Title (left side) ── */
.ik-bc-title {
  font-size: 17px;
  font-weight: 900;
  color: #fff;
  letter-spacing: 0.5px;
}

/* ── Main content ── */
.ik-bc-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #010101 0%, #161616 100%);
}

/* ── Banner preview ── */
.ik-bc-preview {
  flex-shrink: 0;
  padding: 12px 16px 0;
}
.ik-bc-preview__banner-card {
  background: transparent;
  overflow: hidden;
  border-radius: 14px;
}
.ik-bc-preview__banner {
  position: relative;
  border-radius: 0 0 14px 14px;
  overflow: hidden;
  background: #2a2d33 url("/images/banner.png") center/cover no-repeat;
  min-height: 140px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 24px;
}
.ik-bc-preview__user {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  gap: 16px;
}
.ik-bc-preview__avatar-wrap { position: relative; flex-shrink: 0; }
.ik-bc-preview__avatar {
  width: 64px;
  height: 64px;
  border-radius: 999px;
  overflow: hidden;
  border: 3px solid #000;
  box-shadow: 0 4px 16px rgba(0,0,0,0.25);
  background: #000;
}
.ik-bc-preview__avatar-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ik-bc-preview__info { display: flex; flex-direction: column; gap: 8px; padding-top: 4px; }
.ik-bc-preview__name {
  margin: 0;
  font-size: 22px;
  font-weight: 900;
  color: #fff;
  line-height: 1.1;
  text-shadow: 1px 1px 0 rgba(0,0,0,0.4);
}
.ik-bc-preview__tag {
  display: inline-block;
  align-self: flex-start;
  padding: 4px 12px;
  border-radius: 999px;
  background: #000;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.ik-bc-preview__tag--empty { color: rgba(255,255,255,0.85); }
.ik-bc-preview__footer {
  padding: 6px 14px;
  border-bottom: 2px solid #000;
  border-radius: 0 0 14px 14px;
  overflow: hidden;
}
.ik-bc-preview__sig { margin: 0; font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.95); line-height: 1.5; }
.ik-bc-preview__sig--empty { color: rgba(255,255,255,0.35); font-style: italic; }

/* ── Bottom split ── */
.ik-bc-bottom {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 0;
  padding: 12px 16px 16px;
}

/* ── Card grid (left) ── */
.ik-bc-grid-wrap {
  flex: 3;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.ik-bc-grid-scroll {
  flex: 1;
  height: 100%;
}

.ik-bc-grid-loading,
.ik-bc-grid-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #666;
  font-size: 14px;
  gap: 8px;
}

.ik-bc-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
  padding-right: 32px;
}

.ik-bc-grid__item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  padding: 2px;
  border-radius: 12px;
  background: #0f0f0f;
  border: 2px solid transparent;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
  color: #fff;
}
.ik-bc-grid__item:hover { background: #1a1a1a; border-color: #333; }
.ik-bc-grid__item.is-selected { border-color: #fbfe00; background: #1a1a0a; }
.ik-bc-grid__item.is-equipped { border-color: #fbfe00; }
.ik-bc-grid__item.is-selected.is-equipped { border-color: #fbfe00; }

.ik-bc-grid__thumb {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 8px;
  overflow: hidden;
  background: #1a1a1a;
  pointer-events: none;
}
.ik-bc-grid__img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ik-bc-grid__placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 900;
  color: #444;
}

.ik-bc-grid__delete {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  font-size: 15px;
  font-weight: 900;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 140ms ease, transform 140ms ease;
}
.ik-bc-grid__delete:hover { background: rgba(200, 30, 30, 0.9); transform: scale(1.1); }
.ik-bc-grid__delete:disabled { opacity: 0.5; cursor: default; }

.ik-bc-grid__badge-icon {
  position: absolute;
  bottom: 4px;
  right: 4px;
  font-size: 20px;
  color: #00cc0d;
  background: #000;
  border-radius: 999px;
}

/* ── Upload box + actions (right) ── */
.ik-bc-detail {
  flex: 2;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 16px;
  overflow-y: auto;
  -ms-overflow-style: none;
  scrollbar-width: none;
  background: #000;
  border-radius: 12px;
}
.ik-bc-detail::-webkit-scrollbar { display: none; }

.ik-bc-upload {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex: 1;
  min-height: 160px;
  padding: 24px 16px;
  border: 2px dashed #3a3a3a;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.02);
  color: #999;
  cursor: pointer;
  transition: border-color 160ms ease, color 160ms ease, background 160ms ease;
}
.ik-bc-upload:hover {
  border-color: #fbfe00;
  color: #fff;
  background: rgba(20, 20, 0, 0.25);
}
.ik-bc-upload:active { transform: scale(0.99); }
.ik-bc-upload__icon { width: 30px; height: 30px; }
.ik-bc-upload__text { font-size: 15px; font-weight: 800; color: #fff; }
.ik-bc-upload__hint { font-size: 12px; font-weight: 500; color: #888; }
.ik-bc-upload__file { display: none; }

.ik-bc-detail__actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: auto;
  padding-top: 12px;
  font-weight: 900;
}
.ik-bc-detail__actions .z-button {
  min-width: 130px;
}

/* ── Skeleton ── */
@keyframes ik-skel-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.ik-skel {
  background: #222;
  animation: ik-skel-pulse 1.5s ease-in-out infinite;
}
.ik-bc-preview__banner-skel {
  width: 100%;
  min-height: 140px;
  border-radius: 14px;
}

/* ── Fade transition ── */
.ik-fade-enter-active { transition: opacity 0.35s ease; }
.ik-fade-enter-from { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .ik-skel { animation: none; opacity: 0.6; }
}

/* ── Spin animation ── */
@keyframes ik-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.ik-spin { display: inline-block; animation: ik-spin 0.8s linear infinite; }

/* ── Transition animations ──
   动画时长 / 曲线在 theme.css 全局维护；这里只负责给 .ik-bc-dialog
   补回 scale(1.1)，避免全局默认 transform: translateX(±5%) 覆盖掉静态缩放。 */
.ik-overlay-enter-from .ik-bc-dialog { transform: scale(1.1) translateX(5%); }
.ik-overlay-leave-to .ik-bc-dialog { transform: scale(1.1) translateX(-5%); }

/* ── Mobile ── */
@media (max-width: 800px) {
  .ik-bc-dialog { width: 90%; height: 90%; transform: scale(1); }
  .ik-overlay-enter-from .ik-bc-dialog { transform: scale(1) translateX(5%); }
  .ik-overlay-leave-to .ik-bc-dialog { transform: scale(1) translateX(-5%); }
  .ik-bc-bottom { flex-direction: column; }
  .ik-bc-detail { padding: 12px 0 0; }
  /* 移动端无自定义滚动条，去掉桌面端为滚动条轨道预留的右侧间距 */
  .ik-bc-grid { grid-template-columns: repeat(3, 1fr); padding: 0 12px; }
}

@media (max-width: 500px) {
  .ik-bc-dialog { width: 100%; height: 100%; }
  .ik-bc-frame { border-radius: 0; }
  .ik-bc-frame__inner { border-radius: 0; }
  .ik-bc-frame__body { border-radius: 0; }
  .ik-bc-tab-bar { padding: 10px 12px; }
  .ik-bc-close__img { height: 28px; }
}

/* prefers-reduced-motion 由 theme.css 全局接管 */
</style>
