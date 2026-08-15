<script setup lang="ts">
import { useMessage } from "zenless-ui";
import { resolveErrorMessage } from "~/utils/api-error";

const api = useApi();
const auth = useAuthStore();
const { visible, close } = useLoginDialog();
const message = useMessage();

const isLoading = ref(false);

// ── 米游社扫码登录 ──────────────────────────────
const isMihoyo = ref(false);
const mihoyo = useMihoyoQr({
  isActive: () => isMihoyo.value && visible.value,
  width: 220,
  onConfirmed: async (res) => {
    if (res.mode !== "login") return;
    if (!res.auth.token) throw new Error("登录失败：未获取到 Token");
    await onLoginSuccess(res.auth.token, res.auth.user, res.secretKey);
  },
  onError: (err) => {
    message.error(resolveErrorMessage(err, "获取二维码失败"));
  },
});

const mihoyoQrDataUrl = mihoyo.qrDataUrl;
const mihoyoStatus = mihoyo.qrStatus;
const mihoyoNeedRefresh = mihoyo.qrNeedRefresh;

const mihoyoStatusText = computed(() => {
  switch (mihoyoStatus.value) {
    case "loading": return "二维码生成中…";
    case "waiting": return "请使用米游社 App 扫码登录";
    case "scanned": return "已扫码，请在米游社 App 中确认";
    case "confirmed": return "登录中…";
    case "expired": return "二维码已过期，点击刷新";
    case "cancelled": return "已取消扫码，点击刷新重试";
    case "error": return "二维码获取失败，点击刷新重试";
  }
});

const startMihoyoQr = mihoyo.startQr;
const stopMihoyoPolling = mihoyo.stopQr;

const enterMihoyoMode = () => {
  isMihoyo.value = true;
  void startMihoyoQr();
};

const exitMihoyoMode = () => {
  isMihoyo.value = false;
  stopMihoyoPolling();
};

// ── 密钥登录 ──────────────────────────────
const keyInput = ref("");

const handleKeyLogin = async () => {
  const k = keyInput.value.trim();
  if (!k) {
    message.warning("请输入密钥");
    return;
  }
  isLoading.value = true;
  try {
    const res = await api.loginByKey(k);
    if (!res.token) throw new Error("登录失败：密钥无效");
    await onLoginSuccess(res.token, res.user);
  } catch (err) {
    message.error(resolveErrorMessage(err, "密钥登录失败"));
  } finally {
    isLoading.value = false;
  }
};

// ── 登录成功 / 密钥展示 ──────────────────────────────
const secretKeyToShow = ref<string | null>(null);

const onLoginSuccess = async (token: string, user: any, secretKey?: string | null) => {
  if (secretKey) secretKeyToShow.value = secretKey;
  auth.setSession(token, user);
  // 异步拉取完整用户信息
  try {
    const fullUser = await api.getSelfUser();
    auth.setSession(token, fullUser);
  } catch { /* ignore */ }
  // 如果米游社登录未返回密钥，从 profile 接口补取
  if (!secretKeyToShow.value) {
    try {
      const raw = await useNuxtApp().$api("/api/me/profile") as any;
      if (raw?.secretKey) secretKeyToShow.value = raw.secretKey;
    } catch { /* ignore */ }
  }
};

const handleContinue = () => {
  secretKeyToShow.value = null;
  close();
  message.success("登录成功，欢迎回来");
};

const handleCopyKey = async () => {
  if (!secretKeyToShow.value) return;
  try {
    await navigator.clipboard.writeText(secretKeyToShow.value);
    message.success("密钥已复制到剪贴板");
  } catch {
    message.error("复制失败，请手动复制");
  }
};

const handleClose = () => {
  if (!isLoading.value) {
    exitMihoyoMode();
    close();
  }
};

onUnmounted(() => {
  stopMihoyoPolling();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="ik-overlay">
      <div v-if="visible" class="ik-overlay" @mousedown.self="handleClose">
        <div class="ik-overlay__stripe" aria-hidden="true"></div>

        <!-- 密钥展示卡片（登录后如果有密钥） -->
        <div v-if="secretKeyToShow" class="ik-key-card" @click.stop>
          <div class="ik-key-card__outer">
            <div class="ik-key-card__inner">
              <div class="ik-key-card__header">
                <span class="ik-key-card__title">登录成功</span>
              </div>
              <div class="ik-key-card__body">
                <p class="ik-key-card__hint">
                  请妥善保管您的登录密钥，下次登录可直接使用：
                </p>
                <div class="ik-key-card__key-row">
                  <code class="ik-key-card__key">{{ secretKeyToShow }}</code>
                  <button type="button" class="ik-key-card__copy" @click="handleCopyKey">
                    复制
                  </button>
                </div>
                <p class="ik-key-card__warn">⚠ 此密钥仅显示一次，丢失后需重新扫码获取</p>
              </div>
              <div class="ik-key-card__footer">
                <z-button @click="handleContinue">进入绳网</z-button>
              </div>
            </div>
          </div>
        </div>

        <!-- 主登录弹窗 -->
        <div v-else class="ik-dialog" @click.stop>
          <div class="ik-dialog__outer">
            <div class="ik-dialog__inner">
              <div class="ik-dialog__header">
                <span class="ik-dialog__title">登录</span>
                <button class="ik-dialog__close" aria-label="关闭" @click="handleClose">
                  <img src="/images/close-btn.webp" alt="关闭" class="ik-dialog__close-img" draggable="false" />
                </button>
              </div>

              <div class="ik-dialog__body">
                <IkZzzMarquee />
                <div class="ik-login__wrapper">
                  <div class="ik-login__inner">
                    <!-- 米游社扫码登录 -->
                    <button
                      type="button"
                      class="ik-login-mihoyo-btn"
                      @click="enterMihoyoMode"
                    >
                      <img src="/images/mihoyo-icon.webp" alt="" class="ik-login-mihoyo-btn__icon" draggable="false" />
                      <span class="ik-login-mihoyo-btn__text">米游社扫码登录</span>
                    </button>

                    <!-- 分隔线 -->
                    <div class="ik-login-divider" role="separator">
                      <span class="ik-login-divider__line" aria-hidden="true"></span>
                      <span class="ik-login-divider__text">或</span>
                      <span class="ik-login-divider__line" aria-hidden="true"></span>
                    </div>

                    <!-- 密钥登录 -->
                    <z-input
                      v-model="keyInput"
                      placeholder="输入登录密钥"
                      @keydown.enter="handleKeyLogin"
                    />
                  </div>
                  <div class="ik-login-footer">
                    <z-button :disabled="isLoading" @click="handleKeyLogin">
                      {{ isLoading ? "登录中…" : "密钥登录" }}
                    </z-button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 米游社扫码子弹窗 -->
        <Teleport to="body">
          <Transition name="ik-overlay" appear>
            <div v-if="isMihoyo && !secretKeyToShow" class="ik-overlay ik-overlay--sub" @mousedown.self="exitMihoyoMode">
              <div class="ik-overlay__stripe" aria-hidden="true"></div>
              <div class="ik-dialog" @click.stop>
                <div class="ik-dialog__outer">
                  <div class="ik-dialog__inner">
                    <div class="ik-dialog__header">
                      <span class="ik-dialog__title">米游社登录</span>
                      <button class="ik-dialog__close" aria-label="关闭" @click="exitMihoyoMode">
                        <img src="/images/close-btn.webp" alt="关闭" class="ik-dialog__close-img" draggable="false" />
                      </button>
                    </div>
                    <div class="ik-dialog__body">
                      <IkZzzMarquee />
                      <div class="ik-login__wrapper">
                        <div class="ik-login__inner">
                          <div class="ik-mihoyo">
                            <div class="ik-mihoyo__qr-box" :class="{ 'is-dimmed': mihoyoNeedRefresh }">
                              <img
                                v-if="mihoyoQrDataUrl"
                                :src="mihoyoQrDataUrl"
                                alt="米游社登录二维码"
                                class="ik-mihoyo__qr"
                                draggable="false"
                              />
                              <div v-else class="ik-mihoyo__qr-placeholder" />
                              <button
                                v-if="mihoyoNeedRefresh"
                                type="button"
                                class="ik-mihoyo__refresh"
                                @click="startMihoyoQr"
                              >
                                刷新二维码
                              </button>
                            </div>
                            <p class="ik-mihoyo__status" :class="`is-${mihoyoStatus}`">
                              {{ mihoyoStatusText }}
                            </p>
                            <p class="ik-mihoyo__hint">
                              确认后将自动登录，新用户将自动创建绳网账号
                            </p>
                          </div>
                        </div>
                        <div class="ik-login-footer">
                          <z-button @click="exitMihoyoMode">返回</z-button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Transition>
        </Teleport>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ═══════════════════════════════════════════════
   Overlay — 与帖子弹窗完全一致
   ═══════════════════════════════════════════════ */
.ik-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
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

.ik-overlay--sub {
  z-index: 9200;
}

/* ── Dialog Shell ─────────────────────────── */
.ik-dialog {
  position: relative;
  width: 440px;
  max-width: 92%;
  /* dvh 优先（移动端地址栏收起/弹出时高度跟随），100vh 兜底老浏览器 */
  max-height: 85dvh;
  max-height: 85vh;
  overflow: hidden;
  will-change: transform;
}

.ik-dialog__outer {
  width: 100%;
  max-height: 85dvh;
  max-height: 85vh;
  padding: 4px;
  background: #2d2c2d;
  border-radius: 24px 0 24px 24px;
  overflow: hidden;
  box-sizing: border-box;
}

.ik-dialog__inner {
  width: 100%;
  max-height: calc(85dvh - 8px);
  max-height: calc(85vh - 8px);
  padding: 4px;
  background: #000;
  border-radius: 22px 0 22px 22px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.ik-dialog__header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px 8px 24px;
  gap: 8px;
  flex-shrink: 0;
  border-radius: 18px 0 0 0;
  background:
    url("/images/tab-bg-point.webp") repeat,
    linear-gradient(180deg, #161616 0%, #080808 100%);
}

.ik-dialog__title {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
}

.ik-dialog__close {
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

.ik-dialog__close:hover { opacity: 0.85; transform: scale(1.08); }
.ik-dialog__close:active { transform: scale(0.95); }

.ik-dialog__close-img {
  height: 32px;
  width: auto;
  display: block;
  user-select: none;
  -webkit-user-drag: none;
  pointer-events: none;
}

.ik-dialog__body {
  flex: 1 1 auto;
  min-height: 0;
  padding: 24px;
  background: #121212;
  border-radius: 0 0 18px 18px;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  position: relative;
}

.ik-dialog__body::-webkit-scrollbar { display: none; width: 0; height: 0; }

/* ── 登录内容 ─────────────────────────── */
.ik-login__wrapper {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.ik-login__inner {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ik-login-mihoyo-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  padding: 12px 20px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.ik-login-mihoyo-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
}

.ik-login-mihoyo-btn__icon {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  object-fit: contain;
}

/* ── 分隔线 ─────────────────────────── */
.ik-login-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 0;
}

.ik-login-divider__line {
  flex: 1;
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
}

.ik-login-divider__text {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}

/* ── Footer ─────────────────────────── */
.ik-login-footer {
  display: flex;
  gap: 10px;
  padding-top: 8px;
}

.ik-login-footer :deep(.z-button) {
  flex: 1;
}

/* ── 密钥展示卡片 ─────────────────────────── */
.ik-key-card {
  position: relative;
  width: 420px;
  max-width: 92%;
  z-index: 9300;
}

.ik-key-card__outer {
  width: 100%;
  padding: 4px;
  background: #2d2c2d;
  border-radius: 24px 0 24px 24px;
  overflow: hidden;
  box-sizing: border-box;
}

.ik-key-card__inner {
  width: 100%;
  padding: 4px;
  background: #000;
  border-radius: 22px 0 22px 22px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.ik-key-card__header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px 24px;
  flex-shrink: 0;
  border-radius: 18px 0 0 0;
  background:
    url("/images/tab-bg-point.webp") repeat,
    linear-gradient(180deg, #161616 0%, #080808 100%);
}

.ik-key-card__title {
  font-size: 20px;
  font-weight: 800;
  color: #fff;
}

.ik-key-card__body {
  padding: 24px;
  background: #121212;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ik-key-card__hint {
  margin: 0;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.5;
}

.ik-key-card__key-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}

.ik-key-card__key {
  flex: 1;
  font-size: 15px;
  font-weight: 700;
  font-family: monospace;
  color: #BFFF09;
  letter-spacing: 1px;
  word-break: break-all;
  user-select: all;
}

.ik-key-card__copy {
  flex-shrink: 0;
  padding: 6px 14px;
  border: 1px solid rgba(191, 255, 9, 0.4);
  border-radius: 8px;
  background: rgba(191, 255, 9, 0.1);
  color: #BFFF09;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s ease;
}

.ik-key-card__copy:hover {
  background: rgba(191, 255, 9, 0.2);
}

.ik-key-card__warn {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  line-height: 1.4;
}

.ik-key-card__footer {
  padding: 12px 24px 16px;
  background: #121212;
  border-radius: 0 0 18px 18px;
}

/* ── 米游社子弹窗 ─────────────────────────── */
.ik-mihoyo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.ik-mihoyo__qr-box {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 200px;
  height: 200px;
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
}

.ik-mihoyo__qr-box.is-dimmed { opacity: 0.4; }

.ik-mihoyo__qr {
  width: 100%;
  height: 100%;
  display: block;
  image-rendering: pixelated;
}

.ik-mihoyo__qr-placeholder {
  width: 100%;
  height: 100%;
  background: #eee;
}

.ik-mihoyo__refresh {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 20px;
  border: none;
  background: rgba(0, 0, 0, 0.85);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}

.ik-mihoyo__status {
  margin: 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  text-align: center;
}

.ik-mihoyo__status.is-scanned,
.ik-mihoyo__status.is-confirmed {
  color: #BFFF09;
  font-weight: 600;
}

.ik-mihoyo__status.is-expired,
.ik-mihoyo__status.is-cancelled,
.ik-mihoyo__status.is-error {
  color: #ff6b6b;
}

.ik-mihoyo__hint {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  text-align: center;
}
</style>
