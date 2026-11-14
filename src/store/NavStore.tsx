import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../api/nav';
import { DEFAULT_APPEARANCE, applyAppearance } from '../theme/appearance';
import type {
  Appearance,
  CategoryInput,
  CategoryRecord,
  EngineInput,
  SearchEngine,
  SiteInput,
  SiteRecord,
  Theme
} from '../types';

/**
 * 全局数据仓库
 * ------------------------------------------------------------------
 * 数据源是后端 SQLite，页面里所有「增删改」都走这里：
 *  · 启动时 GET /api/bootstrap 拉全量数据
 *  · 收藏 / 主题这类高频操作先乐观更新界面再落库，失败自动回滚
 *  · 分类、站点、引擎属于结构变更，直接以服务端返回为准
 */
interface NavState {
  loading: boolean;
  offline: boolean;
  categories: CategoryRecord[];
  sites: SiteRecord[];
  pins: string[];
  engines: SearchEngine[];
  engineId: string;
  theme: Theme;
  appearance: Appearance;
}

interface NavActions {
  /** 返回操作后的收藏状态（true = 已收藏） */
  togglePin: (url: string) => Promise<boolean>;
  replacePins: (urls: string[]) => Promise<void>;
  setEngine: (id: string) => Promise<void>;
  toggleTheme: () => Promise<void>;
  setAppearance: (patch: Partial<Appearance>) => void;

  createSite: (input: SiteInput) => Promise<SiteRecord>;
  updateSite: (id: number, input: SiteInput) => Promise<SiteRecord>;
  deleteSite: (id: number) => Promise<void>;

  createCategory: (input: CategoryInput) => Promise<CategoryRecord>;
  updateCategory: (id: string, input: Partial<CategoryInput>) => Promise<void>;
  deleteCategory: (id: string, options: { moveTo?: string; force?: boolean }) => Promise<void>;
  moveCategory: (id: string, delta: number) => Promise<void>;

  createEngine: (input: EngineInput) => Promise<SearchEngine>;
  updateEngine: (id: string, input: Partial<EngineInput>) => Promise<void>;
  deleteEngine: (id: string) => Promise<void>;

  resetAll: () => Promise<void>;
  reload: () => Promise<void>;
}

interface NavContextValue {
  state: NavState;
  actions: NavActions;
}

const INITIAL_STATE: NavState = {
  loading: true,
  offline: false,
  categories: [],
  sites: [],
  pins: [],
  engines: [],
  engineId: '',
  theme: 'light',
  appearance: DEFAULT_APPEARANCE
};

const NavContext = createContext<NavContextValue | null>(null);

export function NavProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<NavState>(INITIAL_STATE);
  const stateRef = useRef(state);
  const appearanceTimer = useRef<number | null>(null);

  /** 同步更新 ref 与 state，保证连续操作读到的是最新值 */
  const commit = useCallback((next: NavState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const patch = useCallback(
    (partial: Partial<NavState>) => {
      commit({ ...stateRef.current, ...partial });
    },
    [commit]
  );

  const reload = useCallback(async () => {
    patch({ loading: true });
    try {
      const data = await api.bootstrap();
      commit({
        loading: false,
        offline: false,
        categories: data.categories,
        sites: data.sites,
        pins: data.pins,
        engines: data.engines,
        engineId: data.preferences.engine || data.engines[0]?.id || '',
        theme: data.preferences.theme === 'dark' ? 'dark' : 'light',
        appearance: {
          palette: data.preferences.palette || DEFAULT_APPEARANCE.palette,
          radius: data.preferences.radius || DEFAULT_APPEARANCE.radius
        }
      });
    } catch {
      patch({ loading: false, offline: true });
    }
  }, [commit, patch]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // 外观变化即时生效（写 CSS 变量），theme 也在这里落到 data-theme
  useEffect(() => {
    applyAppearance(state.appearance, state.theme);
  }, [state.appearance, state.theme]);

  /* ---------------- 收藏 ---------------- */

  const togglePin = useCallback(
    async (url: string) => {
      const previous = stateRef.current;
      const wasPinned = previous.pins.includes(url);
      const nextPins = wasPinned
        ? previous.pins.filter((item) => item !== url)
        : [...previous.pins, url];

      patch({ pins: nextPins });

      try {
        const result = await api.savePins(nextPins);
        patch({ pins: result.pins });
        return !wasPinned;
      } catch (error) {
        patch({ pins: previous.pins });
        throw error;
      }
    },
    [patch]
  );

  const replacePins = useCallback(
    async (urls: string[]) => {
      const previous = stateRef.current.pins;
      patch({ pins: urls });
      try {
        const result = await api.savePins(urls);
        patch({ pins: result.pins });
      } catch (error) {
        patch({ pins: previous });
        throw error;
      }
    },
    [patch]
  );

  /* ---------------- 偏好 ---------------- */

  const setEngine = useCallback(
    async (id: string) => {
      const previous = stateRef.current.engineId;
      patch({ engineId: id });
      try {
        await api.savePreferences({ engine: id });
      } catch (error) {
        patch({ engineId: previous });
        throw error;
      }
    },
    [patch]
  );

  const toggleTheme = useCallback(async () => {
    const previous = stateRef.current.theme;
    const next: Theme = previous === 'dark' ? 'light' : 'dark';
    patch({ theme: next });
    try {
      await api.savePreferences({ theme: next });
    } catch (error) {
      patch({ theme: previous });
      throw error;
    }
  }, [patch]);

  /** 配色 / 圆角：立即生效，停顿 260ms 后写入数据库（避免拖颜色时刷接口） */
  const setAppearance = useCallback(
    (partial: Partial<Appearance>) => {
      const previous = stateRef.current.appearance;
      const next = { ...previous, ...partial };
      patch({ appearance: next });

      if (appearanceTimer.current) window.clearTimeout(appearanceTimer.current);
      appearanceTimer.current = window.setTimeout(() => {
        void api.savePreferences(next).catch(() => patch({ appearance: previous }));
      }, 260);
    },
    [patch]
  );

  useEffect(
    () => () => {
      if (appearanceTimer.current) window.clearTimeout(appearanceTimer.current);
    },
    []
  );

  /* ---------------- 站点 ---------------- */

  const createSite = useCallback(
    async (input: SiteInput) => {
      const { site } = await api.createSite(input);
      patch({ sites: [...stateRef.current.sites, site] });
      return site;
    },
    [patch]
  );

  const updateSite = useCallback(
    async (id: number, input: SiteInput) => {
      const before = stateRef.current.sites.find((item) => item.id === id);
      const { site } = await api.updateSite(id, input);

      // 改名 / 换网址时，收藏里指向旧地址的记录跟着换（服务端已同步，这里保持一致）
      const pins =
        before && before.url !== site.url
          ? stateRef.current.pins.map((url) => (url === before.url ? site.url : url))
          : stateRef.current.pins;

      patch({
        sites: stateRef.current.sites.map((item) => (item.id === id ? site : item)),
        pins
      });
      return site;
    },
    [patch]
  );

  const deleteSite = useCallback(
    async (id: number) => {
      const target = stateRef.current.sites.find((item) => item.id === id);
      const previous = stateRef.current;
      patch({
        sites: previous.sites.filter((item) => item.id !== id),
        pins: target ? previous.pins.filter((url) => url !== target.url) : previous.pins
      });
      try {
        await api.deleteSite(id);
      } catch (error) {
        patch({ sites: previous.sites, pins: previous.pins });
        throw error;
      }
    },
    [patch]
  );

  /* ---------------- 分类 ---------------- */

  const createCategory = useCallback(
    async (input: CategoryInput) => {
      const { category } = await api.createCategory(input);
      patch({ categories: [...stateRef.current.categories, category] });
      return category;
    },
    [patch]
  );

  const updateCategory = useCallback(
    async (id: string, input: Partial<CategoryInput>) => {
      const { category } = await api.updateCategory(id, input);
      patch({ categories: stateRef.current.categories.map((item) => (item.id === id ? category : item)) });
    },
    [patch]
  );

  const deleteCategory = useCallback(
    async (id: string, options: { moveTo?: string; force?: boolean }) => {
      const result = await api.deleteCategory(id, options);
      patch({ categories: result.categories, sites: result.sites, pins: result.pins });
    },
    [patch]
  );

  const moveCategory = useCallback(
    async (id: string, delta: number) => {
      const list = [...stateRef.current.categories].sort((a, b) => a.position - b.position);
      const index = list.findIndex((item) => item.id === id);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= list.length) return;

      const [moved] = list.splice(index, 1);
      list.splice(target, 0, moved);

      // 先本地重排（序号按数组顺序重算），再用服务端结果校准
      patch({ categories: list.map((item, i) => ({ ...item, position: i })) });
      const result = await api.reorderCategories(list.map((item) => item.id));
      patch({ categories: result.categories });
    },
    [patch]
  );

  /* ---------------- 搜索引擎 ---------------- */

  const createEngine = useCallback(
    async (input: EngineInput) => {
      const { engine } = await api.createEngine(input);
      patch({ engines: [...stateRef.current.engines, engine] });
      return engine;
    },
    [patch]
  );

  const updateEngine = useCallback(
    async (id: string, input: Partial<EngineInput>) => {
      const { engine } = await api.updateEngine(id, input);
      patch({ engines: stateRef.current.engines.map((item) => (item.id === id ? engine : item)) });
    },
    [patch]
  );

  const deleteEngine = useCallback(
    async (id: string) => {
      const result = await api.deleteEngine(id);
      patch({
        engines: result.engines,
        engineId: result.preferences.engine || result.engines[0]?.id || ''
      });
    },
    [patch]
  );

  /* ---------------- 维护 ---------------- */

  const resetAll = useCallback(async () => {
    const result = await api.reset();
    commit({
      loading: false,
      offline: false,
      categories: result.categories,
      sites: result.sites,
      pins: result.pins,
      engines: result.engines,
      engineId: result.preferences.engine || result.engines[0]?.id || '',
      theme: result.preferences.theme === 'dark' ? 'dark' : 'light',
      appearance: {
        palette: result.preferences.palette || DEFAULT_APPEARANCE.palette,
        radius: result.preferences.radius || DEFAULT_APPEARANCE.radius
      }
    });
  }, [commit]);

  const actions = useMemo<NavActions>(
    () => ({
      togglePin,
      replacePins,
      setEngine,
      toggleTheme,
      setAppearance,
      createSite,
      updateSite,
      deleteSite,
      createCategory,
      updateCategory,
      deleteCategory,
      moveCategory,
      createEngine,
      updateEngine,
      deleteEngine,
      resetAll,
      reload
    }),
    [
      togglePin,
      replacePins,
      setEngine,
      toggleTheme,
      setAppearance,
      createSite,
      updateSite,
      deleteSite,
      createCategory,
      updateCategory,
      deleteCategory,
      moveCategory,
      createEngine,
      updateEngine,
      deleteEngine,
      resetAll,
      reload
    ]
  );

  const value = useMemo(() => ({ state, actions }), [state, actions]);

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): NavContextValue {
  const context = useContext(NavContext);
  if (!context) throw new Error('useNav 必须在 NavProvider 内使用');
  return context;
}
