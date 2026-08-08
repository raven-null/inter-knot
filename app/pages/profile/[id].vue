<script setup lang="ts">
import { useMessage } from "zenless-ui";
import type { Avatar, BusinessCard, Post, Profile } from "~/types/entities";
import { isNotFoundError, resolveErrorMessage } from "~/utils/api-error";
import { getCoverAspectRatio } from "~/utils/cover";

const route = useRoute();
const router = useRouter();
const api = useApi();
const postModal = usePostModal();
const pageDataLoading = usePageDataLoading();
const message = useMessage();
const auth = useAuthStore();

const profile = ref<Profile | null>(null);
const loadError = ref(false);
const loading = ref(false);

const SETTINGS_MODALS = ['settings', 'edit-name', 'edit-bio', 'pinned', 'social', 'logout'];
const modalQuery = computed(() => String(route.query.modal || ''));
const showCardModal = computed(() => modalQuery.value === 'banner');
const showAvatarModal = computed(() => modalQuery.value === 'avatar');
const showSettingsModal = computed(() => SETTINGS_MODALS.includes(modalQuery.value));

const openModal = (name: string) => {
  router.replace({ query: { ...route.query, modal: name } });
};
const closeModal = () => {
  const { modal: _, ...rest } = route.query;
  router.replace({ query: rest });
};

const articles = ref<Post[]>([]);
const articleCursor = ref("");
const articleHasNext = ref(true);
const articleLoading = ref(false);

const profileId = computed(() => String(route.params.id || ""));

const PROFILE_ARTICLES_MAX = 6;

/** 个人主页内容区 Tab：发布作品 / 收藏夹 / 历史阅读 */
const profileTab = ref<"works" | "favorites" | "history">("works");

const profileTabs = computed(() => {
  const tabs: Array<{ key: "works" | "favorites" | "history"; label: string }> = [
    { key: "works", label: "发布作品" },
  ];
  if (profile.value?.isSelf) {
    tabs.push({ key: "favorites", label: "收藏夹" });
    tabs.push({ key: "history", label: "历史阅读" });
  }
  return tabs;
});

const loadProfileArticles = async () => {
  if (articleLoading.value || !articleHasNext.value) return;
  articleLoading.value = true;
  try {
    const page = await api.getProfileArticles(profileId.value, articleCursor.value, PROFILE_ARTICLES_MAX);
    articles.value.push(...page.nodes);
    articleCursor.value = page.endCursor;
    articleHasNext.value = page.hasNextPage;
  } catch (err) {
    message.error(resolveErrorMessage(err, "获取用户帖子失败"));
  } finally {
    articleLoading.value = false;
  }
};

const favorites = ref<Post[]>([]);
const favoritesCursor = ref("");
const favoritesHasNext = ref(true);
const favoritesLoading = ref(false);

const loadProfileFavorites = async () => {
  if (favoritesLoading.value || !favoritesHasNext.value) return;
  favoritesLoading.value = true;
  try {
    const page = await api.getProfileFavorites(profileId.value, favoritesCursor.value, PROFILE_ARTICLES_MAX);
    favorites.value.push(...page.nodes);
    favoritesCursor.value = page.endCursor;
    favoritesHasNext.value = page.hasNextPage;
  } catch (err) {
    message.error(resolveErrorMessage(err, "获取收藏失败"));
  } finally {
    favoritesLoading.value = false;
  }
};

const history = ref<Post[]>([]);
const historyCursor = ref("");
const historyHasNext = ref(true);
const historyLoading = ref(false);

const loadProfileHistory = async () => {
  if (historyLoading.value || !historyHasNext.value) return;
  historyLoading.value = true;
  try {
    const page = await api.getProfileHistory(profileId.value, historyCursor.value, PROFILE_ARTICLES_MAX);
    history.value.push(...page.nodes);
    historyCursor.value = page.endCursor;
    historyHasNext.value = page.hasNextPage;
  } catch (err) {
    message.error(resolveErrorMessage(err, "获取阅读历史失败"));
  } finally {
    historyLoading.value = false;
  }
};

const formatNumber = (n: number) => {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
};

const goArticle = (post: Post, event: MouseEvent) => {
  event.preventDefault();
  postModal.open(post.id, {
    coverAspectRatio: getCoverAspectRatio(post.coverWidth, post.coverHeight),
    preview: {
      title: post.title,
      author: post.author,
      createdAt: post.createdAt,
      cover: post.cover || undefined,
    },
  });
};

const authStore = useAuthStore();
const loginDialog = useLoginDialog();
const knockKnockModal = useKnockKnockModal();
const dm = useDmConversations();

/** 当前 profile 与访客之间是否存在任一方向的拉黑关系 */
const isBlockedRelationship = computed<boolean>(() => {
  const p = profile.value;
  return !!(p && (p.isBlockedByMe || p.hasBlockedMe));
});

/** 是否能给当前 profile 用户发私聊：非自己、未隐藏、有 uid、未拉黑 */
const canSendDm = computed<boolean>(() => {
  const p = profile.value;
  if (!p) return false;
  if (p.isSelf) return false;
  if (p.profileHidden) return false;
  if (isBlockedRelationship.value) return false;
  if (typeof p.uid !== "number") return false;
  return true;
});

const dmStarting = ref(false);

/** 发起私聊：与 UserHoverCard 同款流程（找/建会话 → 打开敲敲弹窗并定位） */
const startDm = async () => {
  if (!authStore.isLogin) {
    loginDialog.open();
    return;
  }
  const p = profile.value;
  if (!canSendDm.value || !p || typeof p.uid !== "number") return;
  if (dmStarting.value) return;
  dmStarting.value = true;
  try {
    const { summary } = await dm.openDirectConversation(p.uid);
    knockKnockModal.open({ dmConversationId: summary.documentId });
  } catch (err) {
    message.error(resolveErrorMessage(err, "无法发起私聊"));
  } finally {
    dmStarting.value = false;
  }
};

/** 是否可关注该用户：非自己、未隐藏、未拉黑。 */
const canFollow = computed<boolean>(() => {
  const p = profile.value;
  if (!p) return false;
  if (p.isSelf) return false;
  if (p.profileHidden) return false;
  if (isBlockedRelationship.value) return false;
  return true;
});

/** 是否可拉黑/取消拉黑该用户：非自己、非 AI、有 uid。 */
const canBlock = computed<boolean>(() => {
  const p = profile.value;
  if (!p) return false;
  if (p.isSelf) return false;
  if (p.isAiAgent) return false;
  if (typeof p.uid !== "number") return false;
  return true;
});

const blockLoading = ref(false);

const toggleBlock = async () => {
  const p = profile.value;
  if (!p?.documentId || !canBlock.value) return;
  if (!auth.isLogin) {
    loginDialog.open();
    return;
  }
  if (blockLoading.value) return;
  blockLoading.value = true;
  try {
    const result = await api.toggleUserBlock(p.documentId);
    const next: Profile = { ...p, isBlockedByMe: result.blocked };
    if (result.blocked) {
      next.isFollowing = false;
    }
    profile.value = next;
    message.success(result.blocked ? "已拉黑" : "已取消拉黑");
    // 让文章列表/搜索缓存失效，刷新后应用拉黑过滤
    api.invalidateQueries(["articles"]);
    api.invalidateQueries(["profile"]);
    // 重新拉取个人资料，保持拉黑/取消拉黑后的数据一致性
    try {
      const fresh = await api.getProfile(profileId.value);
      profile.value = fresh;
    } catch {
      // 失败则保持本地乐观更新
    }
    articles.value = [];
    articleCursor.value = "";
    articleHasNext.value = true;
    void loadProfileArticles();
  } catch (err) {
    message.error(resolveErrorMessage(err, "操作失败"));
  } finally {
    blockLoading.value = false;
  }
};

const followLoading = ref(false);

const toggleFollow = async () => {
  if (!authStore.isLogin) {
    loginDialog.open();
    return;
  }
  const p = profile.value;
  if (!canFollow.value || !p?.documentId) return;
  if (followLoading.value) return;
  followLoading.value = true;
  try {
    const result = await api.toggleFollow(p.documentId);
    profile.value = {
      ...p,
      isFollowing: result.following,
      followersCount: result.followersCount,
    };
    message.success(result.following ? "已关注" : "已取消关注");
  } catch (err) {
    message.error(resolveErrorMessage(err, "操作失败"));
  } finally {
    followLoading.value = false;
  }
};

const onCardEquipped = (card: BusinessCard | null) => {
  if (profile.value) {
    profile.value = { ...profile.value, equippedCard: card ?? undefined };
  }
};

const onAvatarEquipped = (avatar: Avatar | null) => {
  if (profile.value) {
    profile.value = {
      ...profile.value,
      equippedAvatar: avatar ?? undefined,
      avatar: avatar?.image || profile.value.avatar,
    };
  }
  authStore.fetchSelfUser();
};

const onCustomAvatarUploaded = (avatarUrl: string) => {
  if (profile.value) {
    profile.value = {
      ...profile.value,
      equippedAvatar: undefined,
      avatar: avatarUrl,
    };
  }
  authStore.fetchSelfUser();
};

const onNameUpdated = (name: string) => {
  if (profile.value) {
    profile.value = { ...profile.value, name };
  }
  authStore.fetchSelfUser();
};

const onBioUpdated = (bio: string) => {
  if (profile.value) {
    profile.value = { ...profile.value, bio: bio || undefined };
  }
};

const onHiddenUpdated = (h: boolean) => {
  if (profile.value) {
    profile.value = { ...profile.value, profileHidden: h };
  }
};

const onPinnedUpdated = async (_pinned: string[] | null) => {
  // 重置文章列表并重新加载，以应用新的精选配置
  articles.value = [];
  articleCursor.value = "";
  articleHasNext.value = true;
  if (!profile.value?.isHidden) {
    await loadProfileArticles();
  }
};

const copyUid = async () => {
  const uid = profile.value?.uid;
  if (uid == null) return;
  try {
    await navigator.clipboard.writeText(String(uid));
    message.success("UID 已复制");
  } catch {
    message.error("复制失败");
  }
};

const profileTitle = computed(() =>
  profile.value?.name ? `${profile.value.name}的主页 - 绳网` : "用户主页 - 绳网",
);
const profileDescription = computed(() =>
  profile.value?.bio || `查看 ${profile.value?.name || "用户"} 在绳网上的帖子和评论`,
);

useSeoMeta({
  title: profileTitle,
  description: profileDescription,
  ogTitle: profileTitle,
  ogDescription: profileDescription,
  ogImage: () => profile.value?.avatar || "/images/zzzicon_200x200.png",
});

const profileTabLabel = useState<string | null>("profileTabLabel", () => null);

onMounted(async () => {
  loading.value = true;
  loadError.value = false;
  profileTab.value = "works";
  pageDataLoading.claim();
  try {
    profile.value = await api.getProfile(profileId.value);
    profileTabLabel.value = profile.value?.isSelf
      ? null
      : (profile.value?.name || profile.value?.login || null);
  } catch (err) {
    if (isNotFoundError(err)) {
      showError({ statusCode: 404, message: "用户不存在" });
      return;
    }
    loadError.value = true;
    message.error(resolveErrorMessage(err, "获取用户信息失败"));
  } finally {
    loading.value = false;
    pageDataLoading.finish();
  }
  if (profile.value && !profile.value.isHidden) {
    void loadProfileArticles();
  }
  if (profile.value?.isSelf) {
    void loadProfileFavorites();
    void loadProfileHistory();
  }
});

onBeforeUnmount(() => {
  profileTabLabel.value = null;
});
</script>

<template>
  <div>
  <section class="ik-profile">
    <!-- ══════════ Skeleton ══════════ -->
    <template v-if="loading">
      <div class="ik-frame">
        <div class="ik-frame__inner">
          <div class="ik-frame__body">

      <!-- Tab bar skeleton -->
      <div class="ik-tab-bar">
        <div class="ik-skel" style="width:120px;height:34px;border-radius:999px"></div>
        <div class="ik-skel" style="width:90px;height:36px;border-radius:999px"></div>
      </div>

      <!-- A-frame skeleton -->
      <div class="ik-aframe">
        <!-- Banner card skeleton -->
        <div class="ik-banner-card">
          <div class="ik-banner ik-banner--skeleton">
            <!-- User row: avatar + info -->
            <div class="ik-banner__user">
              <div class="ik-banner__avatar-wrap">
                <div class="ik-skel ik-skel--circle" style="width:90px;height:90px"></div>
              </div>
              <div class="ik-banner__info">
                <div class="ik-skel" style="width:160px;height:30px;border-radius:6px"></div>
                <div class="ik-skel" style="width:90px;height:28px;border-radius:999px"></div>
              </div>
            </div>
            <!-- Stats row -->
            <div class="ik-banner__stats">
              <div class="ik-skel" style="width:200px;height:16px;border-radius:4px"></div>
            </div>
          </div>
          <!-- Footer signature -->
          <div class="ik-banner-footer" style="padding:8px 34px">
            <div class="ik-skel" style="width:220px;height:14px;border-radius:4px"></div>
          </div>
        </div>

        <!-- Article grid skeleton -->
        <div class="ik-aframe__content">
          <div class="ik-article-grid">
            <div v-for="n in 6" :key="n" class="ik-article-grid__item">
              <div class="ik-skel" style="width:100%;aspect-ratio:3/4;border-radius:12px"></div>
            </div>
          </div>
        </div>
      </div>

          </div>
        </div>
      </div>

      <!-- Bottom actions skeleton -->
      <div class="ik-bottom-actions">
        <div class="ik-skel" style="width:90px;height:40px;border-radius:999px" v-for="n in 4" :key="n"></div>
      </div>
    </template>

    <!-- ══════════ Error ══════════ -->
    <div v-else-if="loadError && !profile" class="ik-empty">加载失败，请刷新重试</div>
    <!-- ══════════ Main Content ══════════ -->
    <template v-else-if="profile">

      <!-- ── 大框 (Double-border frame) ────────── -->
      <div class="ik-frame">
        <div class="ik-frame__inner">
          <div class="ik-frame__body">

      <!-- ── Tab Bar (UID + 更多操作) ──────────── -->
      <div class="ik-tab-bar">
        <div class="ik-tab-bar__left">
          <span class="ik-tab-bar__label">UID:</span>
          <span class="ik-tab-bar__value">{{ profile.uid }}</span>
          <button class="ik-tab-bar__copy" aria-label="复制UID" @click="copyUid">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          </button>
        </div>
        <z-button v-if="profile.isSelf" @click="openModal('settings')">更多操作</z-button>
        <div v-else class="ik-tab-bar__actions">
          <z-button v-if="canFollow" @click="toggleFollow">
            {{ profile.isFollowing ? "已关注" : "关注" }}
          </z-button>
          <z-button v-if="canSendDm" :loading="dmStarting" @click="startDm">私信</z-button>
          <z-button
            v-if="canBlock"
            :loading="blockLoading"
            @click="toggleBlock"
          >
            {{ profile.isBlockedByMe ? "取消拉黑" : "拉黑" }}
          </z-button>
        </div>
      </div>

      <!-- ── A-Frame (包含名片 + 帖子) ────────── -->
      <div class="ik-aframe">

      <!-- ── Profile Banner Card (flush 贴合 A-frame 上边) ─── -->
      <div class="ik-banner-card">
        <div
          class="ik-banner"
          :style="profile.equippedCard?.image ? { backgroundImage: `url('${profile.equippedCard.image}')` } : undefined"
        >
          <!-- User info area (left aligned) -->
          <div class="ik-banner__user">
            <div class="ik-banner__avatar-wrap">
              <div class="ik-banner__avatar">
                <img
                  :src="profile.avatar || '/images/default-avatar.webp'"
                  alt=""
                  class="ik-banner__avatar-img"
                  @error="($event.target as HTMLImageElement).src = '/images/default-avatar.webp'"
                />
              </div>
            </div>

            <div class="ik-banner__info">
              <h1 class="ik-banner__name">{{ profile.name || profile.login || "匿名用户" }}</h1>
              <span v-if="profile.zzz?.nickname" class="ik-banner__zzz-badge" :title="`绝区零 UID ${profile.zzz.uid}`">
                {{ profile.zzz.regionName || "绝区零" }}
              </span>
            </div>
          </div>

          <!-- Hidden badge (self view only) -->
          <div v-if="profile.isSelf && profile.profileHidden" class="ik-banner__hidden-badge">
            个人资料已隐藏，仅自己可见
          </div>
          <!-- Blocked badge (visitor view only) -->
          <div v-else-if="isBlockedRelationship" class="ik-banner__hidden-badge">
            {{ profile.isBlockedByMe ? "你已拉黑该用户" : "你已被该用户拉黑" }}
          </div>

          <!-- Stats text row -->
          <div v-if="profile.stats" class="ik-banner__stats">
            <span class="ik-stat">
              <span class="ik-stat__label">浏览</span>
              <span class="ik-stat__num">{{ formatNumber(profile.stats.totalViews) }}</span>
            </span>
            <span class="ik-stat__sep">-</span>
            <span class="ik-stat">
              <span class="ik-stat__label">评论</span>
              <span class="ik-stat__num">{{ formatNumber(profile.stats.totalComments) }}</span>
            </span>
            <span class="ik-stat__sep">-</span>
            <span class="ik-stat">
              <span class="ik-stat__label">点赞</span>
              <span class="ik-stat__num">{{ formatNumber(profile.stats.totalLikes) }}</span>
            </span>
            <span class="ik-stat__sep">-</span>
            <span class="ik-stat">
              <span class="ik-stat__label">关注</span>
              <span class="ik-stat__num">{{ formatNumber(profile.followingCount ?? 0) }}</span>
            </span>
            <span class="ik-stat__sep">-</span>
            <span class="ik-stat">
              <span class="ik-stat__label">粉丝</span>
              <span class="ik-stat__num">{{ formatNumber(profile.followersCount ?? 0) }}</span>
            </span>
          </div>

        </div>

        <!-- Footer: signature -->
        <z-pattern type="squares" class="ik-banner-footer">
          <p v-if="profile.bio" class="ik-banner-footer__sig">{{ profile.bio }}</p>
          <p v-else class="ik-banner-footer__sig ik-banner-footer__sig--empty">这个人很神秘，什么都没有留下。</p>
        </z-pattern>
      </div>

      <!-- ── 下半 (帖子区域) ───────────────── -->
      <div class="ik-aframe__content">

      <!-- ── 内容区 Tab 导航 ───────────────── -->
      <div class="ik-profile-tabs">
        <button
          v-for="tab in profileTabs"
          :key="tab.key"
          type="button"
          class="ik-profile-tab"
          :class="{ 'is-active': profileTab === tab.key }"
          @click="profileTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- ── 发布作品 ────────────────────── -->
      <section v-if="profileTab === 'works'" class="ik-profile-section">
        <div v-if="profile.isHidden" class="ik-article-grid">
          <div class="ik-article-grid__empty">
            该用户已隐藏个人资料
          </div>
        </div>
        <div v-else-if="isBlockedRelationship" class="ik-article-grid">
          <div class="ik-article-grid__empty">
            {{ profile.isBlockedByMe ? "你已拉黑该用户，内容不可见" : "你已被该用户拉黑，内容不可见" }}
          </div>
        </div>
        <div v-else class="ik-article-grid">
          <template v-if="articleLoading && !articles.length">
            <div v-for="n in 6" :key="n" class="ik-article-grid__item">
              <div class="ik-skel" style="width:100%;aspect-ratio:3/4;border-radius:12px"></div>
            </div>
          </template>
          <div v-else-if="!articles.length" class="ik-article-grid__empty">
            还没有发布任何内容哦
          </div>
          <template v-else>
            <div
              v-for="(item, index) in articles"
              :key="item.id"
              class="ik-article-grid__item"
            >
              <PostCard
                :post="item"
                :eager="index < 6"
                @open="goArticle"
              />
            </div>
          </template>
        </div>
        <div v-if="articleHasNext" class="ik-load-more-wrap">
          <button class="ik-load-more" :disabled="articleLoading" @click="loadProfileArticles">
            {{ articleLoading ? "加载中..." : "加载更多" }}
          </button>
        </div>
      </section>

      <!-- ── 收藏夹 ────────────────────────── -->
      <section v-else-if="profileTab === 'favorites' && profile.isSelf" class="ik-profile-section">
        <div class="ik-article-grid">
          <template v-if="favoritesLoading && !favorites.length">
            <div v-for="n in 6" :key="n" class="ik-article-grid__item">
              <div class="ik-skel" style="width:100%;aspect-ratio:3/4;border-radius:12px"></div>
            </div>
          </template>
          <div v-else-if="!favorites.length" class="ik-article-grid__empty">
            还没有收藏任何帖子
          </div>
          <template v-else>
            <div
              v-for="(item, index) in favorites"
              :key="item.id"
              class="ik-article-grid__item"
            >
              <PostCard
                :post="item"
                :eager="index < 6"
                @open="goArticle"
              />
            </div>
          </template>
        </div>
        <div v-if="favoritesHasNext" class="ik-load-more-wrap">
          <button class="ik-load-more" :disabled="favoritesLoading" @click="loadProfileFavorites">
            {{ favoritesLoading ? "加载中..." : "加载更多" }}
          </button>
        </div>
      </section>

      <!-- ── 历史阅读 ────────────────────────── -->
      <section v-else-if="profileTab === 'history' && profile.isSelf" class="ik-profile-section">
        <div class="ik-article-grid">
          <template v-if="historyLoading && !history.length">
            <div v-for="n in 6" :key="n" class="ik-article-grid__item">
              <div class="ik-skel" style="width:100%;aspect-ratio:3/4;border-radius:12px"></div>
            </div>
          </template>
          <div v-else-if="!history.length" class="ik-article-grid__empty">
            还没有阅读记录
          </div>
          <template v-else>
            <div
              v-for="(item, index) in history"
              :key="item.id"
              class="ik-article-grid__item"
            >
              <PostCard
                :post="item"
                :eager="index < 6"
                @open="goArticle"
              />
            </div>
          </template>
        </div>
        <div v-if="historyHasNext" class="ik-load-more-wrap">
          <button class="ik-load-more" :disabled="historyLoading" @click="loadProfileHistory">
            {{ historyLoading ? "加载中..." : "加载更多" }}
          </button>
        </div>
      </section>

      </div><!-- /.ik-aframe__content -->
      </div><!-- /.ik-aframe -->

          </div>
        </div>
      </div>

      <!-- 更多操作弹窗 -->
      <ClientOnly>
        <Teleport to="body">
          <Transition name="ik-overlay" appear>
            <ProfileSettingsModal
              v-if="showSettingsModal"
              :current-name="profile?.name"
              :current-bio="profile?.bio"
              :current-hidden="profile?.profileHidden"
              :initial-sub="modalQuery"
              @close="closeModal"
              @name-updated="onNameUpdated"
              @bio-updated="onBioUpdated"
              @hidden-updated="onHiddenUpdated"
              @pinned-updated="onPinnedUpdated"
            />
          </Transition>
        </Teleport>
      </ClientOnly>

      <!-- 头像选择弹窗 -->
      <ClientOnly>
        <Teleport to="body">
          <Transition name="ik-overlay" appear>
            <LazyAvatarModal
              v-if="showAvatarModal"
              :profile="profile"
              @close="closeModal"
              @equipped="onAvatarEquipped"
              @custom-uploaded="onCustomAvatarUploaded"
            />
          </Transition>
          <!-- Lazy：cropper（vue-advanced-cropper）按需加载，不进 profile 路由首屏 chunk -->
        </Teleport>
      </ClientOnly>

      <!-- 名片选择弹窗 -->
      <ClientOnly>
        <Teleport to="body">
          <Transition name="ik-overlay" appear>
            <BusinessCardModal
              v-if="showCardModal"
              :profile="profile"
              @close="closeModal"
              @equipped="onCardEquipped"
            />
          </Transition>
        </Teleport>
      </ClientOnly>

    </template>
  </section>
  <AppFooter />
  </div>
</template>

<style scoped>
.ik-profile {
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;
  padding: 16px 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
}

/* ── 大框 (Double-border frame) ──────────────── */
.ik-frame {
  width: 100%;
  display: flex;
  flex-direction: column;
  padding: 4px;
  background: #2D2C2D;
  border-radius: 24px;
}
.ik-frame__inner {
  display: flex;
  flex-direction: column;
  padding: 4px;
  background: #000;
  border-radius: 22px;
  overflow: hidden;
}
.ik-frame__body {
  display: flex;
  flex-direction: column;
  background: transparent;
  padding: 0;
  gap: 0;
  border-radius: 20px;
  overflow: hidden;
}

/* ── Skeleton ─────────────────────────────────── */
@keyframes ik-skel-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.ik-skel {
  background: #222;
  animation: ik-skel-pulse 1.5s ease-in-out infinite;
}
.ik-skel--circle { border-radius: 999px; }
@media (prefers-reduced-motion: reduce) {
  .ik-skel { animation: none; opacity: 0.6; }
}

/* ── Tab Bar (UID + 更多操作) ─────────────── */
.ik-tab-bar {
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
.ik-tab-bar__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ik-tab-bar__left {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  background: #000;
  border-radius: 999px;
  font-weight: 700;
  font-size: 14px;
  color: #fff;
}
.ik-tab-bar__label { letter-spacing: 0.5px; }
.ik-tab-bar__value { font-family: monospace; }
.ik-tab-bar__copy {
  margin-left: 4px;
  color: rgba(255,255,255,0.5);
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  transition: color 0.2s;
}
.ik-tab-bar__copy:hover { color: #fff; }

/* ── A-Frame (透明定位包裹) ───────────────── */
.ik-aframe {
  position: relative;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #010101 0%, #161616 100%);
}
.ik-aframe__content {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ── Banner Card (与帖子卡片左右对齐) ──────── */
.ik-banner-card {
  background: transparent;
  padding: 0;
  margin: 12px 16px 0;
  overflow: hidden;
  border-radius: 14px;
}

.ik-banner {
  position: relative;
  border-radius: 0 0 14px 14px;
  overflow: hidden;
  background: #2a2d33 url("/images/banner.png") center/cover no-repeat;
  min-height: 240px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 24px;
  padding: 32px 36px;
}
@media (min-width: 1024px) and (orientation: landscape) {
  .ik-banner { background-position: 26% center; }
}
.ik-banner--skeleton {
  background: linear-gradient(135deg, #1a1a1a 0%, #222 50%, #1a1a1a 100%);
  border-color: #2a2a2a;
}

/* User info inside banner */
.ik-banner__user {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  gap: 20px;
}
.ik-banner__avatar-wrap {
  position: relative;
  flex-shrink: 0;
}
.ik-banner__avatar {
  width: 90px;
  height: 90px;
  border-radius: 999px;
  overflow: hidden;
  border: 4px solid #000;
  box-shadow: 0 4px 16px rgba(0,0,0,0.25);
  background: #000;
}
.ik-banner__avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.ik-banner__info {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 6px;
}
.ik-banner__name {
  margin: 0;
  font-size: 30px;
  font-weight: 900;
  color: #fff;
  line-height: 1.1;
  text-shadow: 1px 1px 0 rgba(0,0,0,0.4);
  letter-spacing: 0.5px;
}
.ik-banner__title-tag {
  display: inline-block;
  align-self: flex-start;
  padding: 5px 16px;
  border-radius: 999px;
  background: #000;
  box-shadow: inset 0 -2px 0 rgba(0,0,0,0.3), 0 2px 0 rgba(0,0,0,0.2);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.ik-banner__title-tag--empty {
  background: #000;
  box-shadow: none;
  color: rgba(255,255,255,0.6);
  font-style: italic;
}

/* 绝区零玩家名徽章（米游社绑定） */
.ik-banner__zzz-badge {
  display: inline-block;
  align-self: flex-start;
  margin-top: 6px;
  padding: 4px 14px;
  border-radius: 999px;
  background: #000;
  color: #bfff09;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

/* Hidden profile badge */
.ik-banner__hidden-badge {
  position: relative;
  z-index: 1;
  align-self: flex-start;
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.7);
  color: #ffcf3b;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.3px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

/* Stat text row */
.ik-banner__stats {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  margin-top: auto;
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.3px;
  text-shadow: 
    0 1px 4px rgba(0, 0, 0, 0.6),
    0 0 2px rgba(0, 0, 0, 0.3);
}
.ik-stat {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
}
.ik-stat__label {
  color: rgba(255, 255, 255, 0.85);
  font-weight: 700;
}
.ik-stat__num {
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}
.ik-stat__sep {
  color: rgba(255, 255, 255, 0.5);
  font-weight: 700;
}

/* Banner footer */
.ik-banner-footer {
  padding: 8px 34px;
  border-bottom: 2px solid #000;
  border-radius: 0 0 14px 14px;
  overflow: hidden;
}
.ik-banner-footer__sig {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: rgba(255,255,255,0.95);
  line-height: 1.5;
}
.ik-banner-footer__sig--empty {
  color: rgba(255,255,255,0.35);
  font-style: italic;
}

/* ── Article Grid（自适应列数：小屏 2 列 → 大屏 6+ 列） ── */
.ik-article-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 12px;
}
.ik-article-grid__empty {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  font-size: 14px;
  color: #555;
  border-radius: 16px;
  background: #0f0f0f;
  border: 1px solid #1f1f1f;
}
.ik-article-grid__item {
  --ik-post-card-radius: 16px;
  --ik-post-card-inner-radius: 12px;
  border-radius: 16px;
  overflow: hidden;
}
.ik-article-grid__item :deep(.ik-card__cover-frame) {
  aspect-ratio: 1 / 1 !important;
  max-height: none;
  overflow: hidden;
}

/* Load more */
.ik-load-more-wrap {
  display: flex;
  justify-content: center;
}
.ik-load-more {
  padding: 10px 32px;
  border-radius: 999px;
  background: #0f0f0f;
  color: rgba(255,255,255,0.9);
  font-weight: 700;
  font-size: 14px;
  border: 1px solid #2a2a2a;
  cursor: pointer;
  transition: background 0.2s;
}
.ik-load-more:hover { background: #1a1a1a; }
.ik-load-more:disabled { opacity: 0.5; cursor: default; }

@keyframes ik-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.ik-spin {
  display: inline-block;
  animation: ik-spin 0.8s linear infinite;
}

/* ── Profile Sections (发布作品 / 收藏夹 / 历史阅读) ─ */
.ik-tab-bar :deep(.z-button__content) {
  font-weight: 700;
}

/* 内容区 Tab 导航（左右切换） */
.ik-profile-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  align-self: flex-start;
  max-width: 100%;
  overflow-x: auto;
  scrollbar-width: none;
}
.ik-profile-tabs::-webkit-scrollbar {
  display: none;
}
.ik-profile-tab {
  flex-shrink: 0;
  padding: 8px 18px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: rgba(255, 255, 255, 0.65);
  font-size: 14px;
  font-weight: 700;
  font-family: inherit;
  letter-spacing: 0.3px;
  cursor: pointer;
  transition: background-color 180ms ease, color 180ms ease;
}
.ik-profile-tab:hover {
  color: #fff;
}
.ik-profile-tab.is-active {
  background: var(--ik-primary, #bfff09);
  color: #0a0a0a;
}

.ik-profile-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ik-profile-section__title {
  margin: 0;
  padding: 0 4px;
  font-size: 17px;
  font-weight: 900;
  color: #fff;
  letter-spacing: 0.5px;
}

/* ── Responsive ─────────────────────────────── */
@media (min-width: 640px) {
  .ik-profile { padding: 20px 24px 32px; }
}
/* 大屏横屏：网格列数由 auto-fill 自动适配（页面自然滚动，不再强制一屏） */
@media (min-width: 1024px) and (orientation: landscape) {
  .ik-article-grid__item :deep(.ik-card__cover-frame) {
    max-height: 245px;
  }
}

/* ── Medium / portrait viewports ─────────────────
   The fixed-viewport layout (height: 100vh - 78px + overflow:hidden) only
   fits on large landscape displays. On any smaller width or portrait
   orientation the banner + grid + bottom actions exceed the viewport, so
   we let the page scroll naturally and remove the inner clipping.
   The bottom action bar (修改头像/称号/勋章/名片) is folded into the
   ProfileSettingsModal on these viewports, so we hide it here. */
@media (max-width: 1023px), (orientation: portrait) {
  .ik-profile {
    height: auto;
    min-height: 0;
    overflow: visible;
  }
  .ik-frame,
  .ik-frame__inner,
  .ik-frame__body,
  .ik-aframe,
  .ik-aframe__content {
    flex: initial;
    min-height: 0;
  }
  .ik-aframe__content {
    overflow: visible;
  }
  .ik-article-grid__item :deep(.ik-card__cover-frame) {
    max-height: none;
  }
}

/* Account for fixed MobileBottomNav (58px) — shown on screens ≤1100px */
@media (max-width: 1100px) {
  .ik-profile {
    padding-bottom: calc(58px + env(safe-area-inset-bottom, 0px) + 16px);
  }
}

@media (max-width: 639px) {
  /* Frame corners (.ik-frame / .ik-frame__inner) intentionally inherit
     desktop values so the tab bar's visible top corners (which are
     clipped by these parents' overflow:hidden + border-radius) match the
     tablet/desktop look. */
  .ik-tab-bar { padding: 8px 14px; min-height: 44px; }
  .ik-banner { min-height: 240px; padding: 22px 18px; }
  .ik-banner__avatar { width: 68px; height: 68px; border-width: 3px; }
  .ik-banner__name { font-size: 22px; }
  .ik-banner__title-tag { font-size: 13px; padding: 4px 12px; }
  .ik-banner__stats { font-size: 13px; gap: 8px; }
  .ik-aframe__content { padding: 10px; gap: 10px; }
  /* Keep the same top gap between tab bar and banner card as desktop;
     just trim horizontal margin a bit on tiny screens. */
  .ik-banner-card { margin: 12px 10px 0; }
}
</style>
