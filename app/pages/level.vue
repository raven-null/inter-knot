<script setup lang="ts">
import { useMessage } from "zenless-ui";
import { resolveErrorMessage } from "~/utils/api-error";
import { LEVEL_THRESHOLDS, LEVEL_TITLES, MAX_LEVEL, levelView } from "~/utils/level";

const auth = useAuthStore();
const api = useApi();
const message = useMessage();

useSeoMeta({
  title: "绳网等级 - 绳网",
});

// 登录守卫：未登录弹登录框并回首页
const loginDialog = useLoginDialog();
if (import.meta.client && !auth.isLogin) {
  loginDialog.open();
  navigateTo("/");
}

const view = computed(() => levelView(auth.user?.exp ?? 0));

// 当前等级环（SVG）：半径 52，周长 2πr ≈ 326.7
const RING_R = 52;
const RING_CIRC = 2 * Math.PI * RING_R;
const ringDash = computed(() => {
  const pct = view.value.progressPercent;
  return `${(RING_CIRC * pct) / 100} ${RING_CIRC}`;
});

// 升级所需：本等级内还需多少经验
const expWithinLevel = computed(() => Math.max(0, view.value.nextThreshold - view.value.exp));

// 等级一览表
const levelGuideRows = Array.from({ length: MAX_LEVEL }, (_, index) => {
  const level = index + 1;
  return {
    level,
    title: LEVEL_TITLES[level] ?? "",
    totalExp: LEVEL_THRESHOLDS[index] ?? 0,
    isCurrent: level === view.value.level,
    spanExp:
      level < MAX_LEVEL
        ? (LEVEL_THRESHOLDS[level] ?? 0) - (LEVEL_THRESHOLDS[level - 1] ?? 0)
        : 0,
  };
});

const formatNum = (n: number) => n.toLocaleString("zh-CN");

// 经验规则
const EXP_RULES = [
  { action: "发布帖子", desc: "每日首次", exp: 4 },
  { action: "发表评论", desc: "每日首次", exp: 3 },
  { action: "收到点赞", desc: "每收到 1 个", exp: 1 },
];
</script>

<template>
  <section class="ik-level-page">
    <div class="ik-level-page__inner">
      <!-- ── 顶部：当前等级卡片 ─────────────────────────── -->
      <div class="ik-level-hero">
        <div class="ik-level-hero__ring">
          <svg class="ik-level-hero__ring-svg" viewBox="0 0 128 128" aria-hidden="true">
            <circle class="ik-level-hero__ring-track" cx="64" cy="64" :r="RING_R" fill="none" />
            <circle
              class="ik-level-hero__ring-fill"
              cx="64"
              cy="64"
              :r="RING_R"
              fill="none"
              stroke-dasharray="326.7 326.7"
              :stroke-dashoffset="326.7 - (326.7 * view.progressPercent) / 100"
            />
          </svg>
          <div class="ik-level-hero__ring-center">
            <span class="ik-level-hero__level">Lv.{{ view.level }}</span>
            <span class="ik-level-hero__pct">{{ view.progressPercent }}%</span>
          </div>
        </div>

        <div class="ik-level-hero__info">
          <h1 class="ik-level-hero__title">{{ view.title }}</h1>
          <p class="ik-level-hero__name">{{ auth.user?.name || "绳匠" }} 的绳网信用</p>
          <p v-if="view.level < MAX_LEVEL" class="ik-level-hero__hint">
            距离 <strong>Lv.{{ view.level + 1 }}</strong> 还差
            <strong class="ik-level-hero__hint-num">{{ formatNum(expWithinLevel) }}</strong>
            绳网信用
          </p>
          <p v-else class="ik-level-hero__hint ik-level-hero__hint--max">已达最高等级，感谢一路相伴！</p>
          <div class="ik-level-hero__bar">
            <div class="ik-level-hero__bar-fill" :style="{ width: `${view.progressPercent}%` }"></div>
          </div>
          <p class="ik-level-hero__exp">
            {{ formatNum(view.exp) }} / {{ formatNum(view.nextThreshold) }}
            <span class="ik-level-hero__exp-unit">累计绳网信用</span>
          </p>
        </div>
      </div>

      <!-- ── 经验获取规则 ─────────────────────────────── -->
      <div class="ik-level-card">
        <h2 class="ik-level-card__title">绳网信用获取</h2>
        <div class="ik-level-rules">
          <div v-for="r in EXP_RULES" :key="r.action" class="ik-level-rule">
            <div class="ik-level-rule__text">
              <span class="ik-level-rule__action">{{ r.action }}</span>
              <span class="ik-level-rule__desc">{{ r.desc }}</span>
            </div>
            <span class="ik-level-rule__exp">+{{ r.exp }}</span>
          </div>
        </div>
        <p class="ik-level-card__muted">绳网信用由「主动行为」获得，达到门槛自动升级。</p>
      </div>

      <!-- ── 等级一览表 ───────────────────────────────── -->
      <div class="ik-level-card">
        <h2 class="ik-level-card__title">等级一览</h2>
        <ul class="ik-level-table">
          <li
            v-for="row in levelGuideRows"
            :key="row.level"
            class="ik-level-table__row"
            :class="{ 'is-current': row.isCurrent }"
          >
            <span class="ik-level-table__lv">Lv.{{ row.level }}</span>
            <span class="ik-level-table__title">{{ row.title }}</span>
            <span class="ik-level-table__exp">
              累计 {{ formatNum(row.totalExp) }}
              <template v-if="row.spanExp > 0">
                · 本级需 {{ formatNum(row.spanExp) }}
              </template>
              <template v-else>· 满级</template>
            </span>
            <span v-if="row.isCurrent" class="ik-level-table__current">当前</span>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* ── 页面布局 ─────────────────────────────── */
.ik-level-page {
  /* dvh 优先：移动端地址栏收起/弹出时页面高度跟随视口 */
  min-height: 100dvh;
  min-height: 100vh;
  display: flex;
  justify-content: center;
  padding: 32px 16px 96px;
  box-sizing: border-box;
}

.ik-level-page__inner {
  width: 100%;
  max-width: 720px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ── Hero 卡片 ────────────────────────────── */
.ik-level-hero {
  display: flex;
  align-items: center;
  gap: 28px;
  padding: 28px 32px;
  background:
    linear-gradient(135deg, rgba(70, 97, 253, 0.14) 0%, rgba(16, 191, 240, 0.08) 55%, transparent 100%),
    #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px 0 24px 24px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}

.ik-level-hero__ring {
  position: relative;
  flex-shrink: 0;
  width: 128px;
  height: 128px;
}

.ik-level-hero__ring-svg {
  width: 128px;
  height: 128px;
  transform: rotate(-90deg);
}

.ik-level-hero__ring-track {
  stroke: #2a2a2a;
  stroke-width: 10;
}

.ik-level-hero__ring-fill {
  stroke: url(#ik-level-grad);
  stroke: #BFFF09;
  stroke-width: 10;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.4s ease;
}

.ik-level-hero__ring-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.ik-level-hero__level {
  font-size: 28px;
  font-weight: 900;
  font-style: italic;
  color: #fff;
  line-height: 1;
  letter-spacing: 0.5px;
}

.ik-level-hero__pct {
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.5);
}

.ik-level-hero__info {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ik-level-hero__title {
  margin: 0;
  font-size: 26px;
  font-weight: 900;
  color: #fff;
  line-height: 1.2;
}

.ik-level-hero__name {
  margin: 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.55);
}

.ik-level-hero__hint {
  margin: 2px 0 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
}

.ik-level-hero__hint strong {
  color: #BFFF09;
  font-weight: 700;
}

.ik-level-hero__hint-num {
  font-variant-numeric: tabular-nums;
}

.ik-level-hero__hint--max {
  color: rgba(191, 255, 9, 0.8);
}

.ik-level-hero__bar {
  position: relative;
  height: 8px;
  border-radius: 999px;
  background: #2a2a2a;
  overflow: hidden;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.5);
}

.ik-level-hero__bar-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #4661fd 0%, #10bff0 100%);
  transition: width 0.4s ease;
}

.ik-level-hero__exp {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #fff;
}

.ik-level-hero__exp-unit {
  margin-left: 6px;
  font-size: 12px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.45);
}

/* ── 通用卡片 ─────────────────────────────── */
.ik-level-card {
  padding: 22px 24px;
  background: #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px 0 24px 24px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
}

.ik-level-card__title {
  margin: 0 0 16px;
  font-size: 16px;
  font-weight: 800;
  color: #fff;
}

.ik-level-card__muted {
  margin: 12px 0 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
}

/* ── 经验规则 ─────────────────────────────── */
.ik-level-rules {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ik-level-rule {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
}

.ik-level-rule__text {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ik-level-rule__action {
  font-size: 14px;
  font-weight: 700;
  color: #fff;
}

.ik-level-rule__desc {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}

.ik-level-rule__exp {
  font-size: 15px;
  font-weight: 800;
  font-style: italic;
  color: #BFFF09;
  font-variant-numeric: tabular-nums;
}

/* ── 等级一览表 ────────────────────────────── */
.ik-level-table {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ik-level-table__row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid transparent;
}

.ik-level-table__row.is-current {
  background: rgba(191, 255, 9, 0.08);
  border-color: rgba(191, 255, 9, 0.35);
}

.ik-level-table__lv {
  flex-shrink: 0;
  min-width: 48px;
  font-size: 15px;
  font-weight: 900;
  font-style: italic;
  color: #BFFF09;
}

.ik-level-table__title {
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 700;
  color: #fff;
}

.ik-level-table__exp {
  flex: 1 1 auto;
  text-align: right;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.5);
}

.ik-level-table__current {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  background: #BFFF09;
  color: #000;
  font-size: 11px;
  font-weight: 800;
}

/* ── 响应式 ──────────────────────────────── */
@media (max-width: 560px) {
  .ik-level-hero {
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 24px 20px;
    gap: 18px;
  }
  .ik-level-hero__info {
    align-items: center;
  }
  .ik-level-hero__bar {
    width: 100%;
    max-width: 320px;
  }
  .ik-level-table__exp {
    display: none;
  }
  .ik-level-table__row {
    justify-content: space-between;
  }
}
</style>
