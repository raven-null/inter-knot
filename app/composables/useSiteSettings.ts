/**
 * 站点公开设置（导航开关 / 公告等）
 * - 前端加载一次并缓存（useState 共享）
 * - 后台「论坛设置」卡片修改后，前端刷新页面即可生效
 */

export interface SiteSettings {
  siteName: string;
  announcement: string;
  showSearch: boolean;
  showPresence: boolean;
  showKnock: boolean;
  showCreate: boolean;
  showAdmin: boolean;
  showLevel: boolean;
}

const DEFAULTS: SiteSettings = {
  siteName: "绳网",
  announcement: "",
  showSearch: true,
  showPresence: true,
  showKnock: true,
  showCreate: true,
  showAdmin: true,
  showLevel: false,
};

let loaded = false;

export function useSiteSettings() {
  const settings = useState<SiteSettings>("site:settings", () => ({ ...DEFAULTS }));

  const load = async () => {
    if (loaded || !import.meta.client) return;
    loaded = true;
    try {
      const nuxtApp = useNuxtApp();
      const res = await nuxtApp.$api<Partial<SiteSettings>>("/api/settings/public");
      if (res) settings.value = { ...DEFAULTS, ...res };
    } catch {
      // 加载失败时使用默认值
    }
  };

  return { settings, load };
}
