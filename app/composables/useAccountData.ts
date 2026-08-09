import { useLocalStorage } from "@vueuse/core";
import { useMessage } from "zenless-ui";
import { resolveErrorMessage } from "~/utils/api-error";
import type { AccountSecurity, BlockedUser, MihoyoBinding } from "~/types/entities";

const STORAGE_KEY = "ik:account:data";
const STALE_TIME = 5 * 60 * 1000; // 5 分钟后重新拉取

interface AccountDataState {
  security: AccountSecurity | null;
  securityFetchedAt: number | null;
  mihoyoBinding: MihoyoBinding | null;
  mihoyoFetchedAt: number | null;
  blockedUsers: BlockedUser[];
  blockedHasNext: boolean;
  blockedCursor: string;
  blockedFetchedAt: number | null;
}

function defaultState(): AccountDataState {
  return {
    security: null,
    securityFetchedAt: null,
    mihoyoBinding: null,
    mihoyoFetchedAt: null,
    blockedUsers: [],
    blockedHasNext: true,
    blockedCursor: "",
    blockedFetchedAt: null,
  };
}

function isStale(fetchedAt: number | null) {
  return !fetchedAt || Date.now() - fetchedAt > STALE_TIME;
}

let _instance: ReturnType<typeof createAccountData> | null = null;

function createAccountData() {
  const state = useLocalStorage<AccountDataState>(STORAGE_KEY, defaultState(), {
    mergeDefaults: true,
  });

  const auth = useAuthStore();
  const api = useApi();
  const message = useMessage();

  const securityLoading = ref(false);
  const mihoyoLoading = ref(false);
  const blockedLoading = ref(false);
  const mihoyoUnbinding = ref(false);

  const security = computed(() => state.value.security);
  const securityFetchedAt = computed({
    get: () => state.value.securityFetchedAt,
    set: (v) => { state.value.securityFetchedAt = v; },
  });
  const mihoyoBinding = computed(() => state.value.mihoyoBinding);
  const mihoyoFetchedAt = computed({
    get: () => state.value.mihoyoFetchedAt,
    set: (v) => { state.value.mihoyoFetchedAt = v; },
  });
  const blockedUsers = computed(() => state.value.blockedUsers);
  const blockedHasNext = computed({
    get: () => state.value.blockedHasNext,
    set: (v) => { state.value.blockedHasNext = v; },
  });
  const blockedCursor = computed({
    get: () => state.value.blockedCursor,
    set: (v) => { state.value.blockedCursor = v; },
  });
  const blockedFetchedAt = computed({
    get: () => state.value.blockedFetchedAt,
    set: (v) => { state.value.blockedFetchedAt = v; },
  });

  const securityLoaded = computed(() => securityFetchedAt.value !== null);
  const mihoyoLoaded = computed(() => mihoyoFetchedAt.value !== null);
  const blockedLoaded = computed(() => blockedFetchedAt.value !== null);

  const loadSecurity = async (force = false) => {
    if (!auth.isLogin || securityLoading.value) return;
    if (!force && !isStale(securityFetchedAt.value)) return;

    securityLoading.value = true;
    try {
      state.value.security = await api.getMySecurity();
      securityFetchedAt.value = Date.now();
    } catch (err) {
      state.value.security = { secretKey: null };
      securityFetchedAt.value = Date.now();
      message.error(resolveErrorMessage(err, "获取账号安全信息失败"));
    } finally {
      securityLoading.value = false;
    }
  };

  const loadMihoyo = async (force = false) => {
    if (!auth.isLogin || mihoyoLoading.value) return;
    if (!force && !isStale(mihoyoFetchedAt.value)) return;

    mihoyoLoading.value = true;
    try {
      state.value.mihoyoBinding = await api.getMihoyoBinding();
      mihoyoFetchedAt.value = Date.now();
    } catch (err) {
      message.error(resolveErrorMessage(err, "获取米游社绑定信息失败"));
    } finally {
      mihoyoLoading.value = false;
    }
  };

  const loadBlocked = async (opts: { reset?: boolean } = {}) => {
    if (!auth.isLogin || blockedLoading.value || (!blockedHasNext.value && !opts.reset)) return;

    if (opts.reset) {
      state.value.blockedUsers = [];
      blockedCursor.value = "";
      blockedHasNext.value = true;
    }

    blockedLoading.value = true;
    try {
      const page = await api.getMyBlockedList(blockedCursor.value);
      state.value.blockedUsers = [...state.value.blockedUsers, ...page.nodes];
      blockedHasNext.value = page.hasNextPage;
      blockedCursor.value = page.endCursor;
      blockedFetchedAt.value = Date.now();
    } catch (err) {
      message.error(resolveErrorMessage(err, "加载黑名单失败"));
    } finally {
      blockedLoading.value = false;
    }
  };

  const ensureSecurity = (force = false) => loadSecurity(force);
  const ensureMihoyo = (force = false) => loadMihoyo(force);
  const ensureBlocked = (force = false) => loadBlocked({ reset: force || isStale(blockedFetchedAt.value) });

  const ensureLoaded = async (force = false) => {
    await Promise.all([
      ensureSecurity(force),
      ensureMihoyo(force),
      ensureBlocked(force),
    ]);
  };

  const unbindMihoyo = async () => {
    if (mihoyoUnbinding.value) return;
    mihoyoUnbinding.value = true;
    try {
      await api.unbindMihoyo();
      state.value.mihoyoBinding = null;
      mihoyoFetchedAt.value = Date.now();
      message.success("已解除米游社绑定");
    } catch (err) {
      message.error(resolveErrorMessage(err, "解绑失败"));
    } finally {
      mihoyoUnbinding.value = false;
    }
  };

  const unblockUser = async (user: BlockedUser) => {
    if (!user.documentId) return;
    try {
      await api.toggleUserBlock(user.documentId);
      message.success("已取消拉黑");
      state.value.blockedUsers = state.value.blockedUsers.filter(
        (u) => u.documentId !== user.documentId,
      );
      api.invalidateQueries(["articles"]);
      api.invalidateQueries(["profile"]);
    } catch (err) {
      message.error(resolveErrorMessage(err, "取消拉黑失败"));
    }
  };

  const setMihoyoBinding = (binding: MihoyoBinding | null) => {
    state.value.mihoyoBinding = binding;
    mihoyoFetchedAt.value = Date.now();
  };

  const clearBlocked = () => {
    state.value.blockedUsers = [];
    blockedCursor.value = "";
    blockedHasNext.value = true;
    blockedFetchedAt.value = null;
  };

  const clear = () => {
    state.value = defaultState();
  };

  if (import.meta.client) {
    // 登录（含米游社等）后清空上一用户的本地缓存，确保重新拉取当前账号的绑定/黑名单
    window.addEventListener("auth:login", clear);
    window.addEventListener("auth:logout", clear);
  }

  return {
    security,
    securityLoading,
    securityLoaded,
    mihoyoBinding,
    mihoyoLoading,
    mihoyoLoaded,
    mihoyoUnbinding,
    blockedUsers,
    blockedLoading,
    blockedLoaded,
    blockedHasNext,

    ensureLoaded,
    ensureSecurity,
    ensureMihoyo,
    ensureBlocked,
    loadBlocked,
    unbindMihoyo,
    unblockUser,
    setMihoyoBinding,
    clearBlocked,
    clear,
  };
}

export function useAccountData() {
  return _instance ?? (_instance = createAccountData());
}
