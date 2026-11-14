import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SectionBlock } from './components/SectionBlock';
import { SettingsPanel } from './components/SettingsPanel';
import { Sidebar } from './components/Sidebar';
import type { NavItem } from './components/Sidebar';
import { SiteModal } from './components/SiteModal';
import { ToastProvider, useToast } from './components/Toast';
import { TopBar } from './components/TopBar';
import { NavProvider, useNav } from './store/NavStore';
import type { SiteInput, SiteItem } from './types';
import { matchesQuery } from './utils/filter';
import { buildSearchUrl, normalizeUrl } from './utils/url';
import styles from './App.module.css';

const errorText = (error: unknown, fallback = '保存失败，请稍后重试') =>
  error instanceof Error ? error.message : fallback;

interface ModalState {
  open: boolean;
  mode: 'create' | 'edit';
  site: SiteItem | null;
  categoryId: string;
}

const CLOSED_MODAL: ModalState = { open: false, mode: 'create', site: null, categoryId: '' };

function NavPage() {
  const notify = useToast();
  const { state, actions } = useNav();
  const { categories, sites, pins, engines, engineId, theme, loading, offline } = state;
  const searchInputRef = useRef<HTMLInputElement>(null);

  /* ---------------- 会话状态 ---------------- */
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [modal, setModal] = useState<ModalState>(CLOSED_MODAL);

  /* ---------------- 派生数据 ---------------- */
  const categoryNameById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories]
  );

  const items = useMemo<SiteItem[]>(
    () =>
      sites.map((site) => ({
        ...site,
        categoryName: categoryNameById.get(site.categoryId) ?? '未分类'
      })),
    [sites, categoryNameById]
  );

  const byKey = useMemo(() => new Map(items.map((item) => [item.url, item])), [items]);
  const pinSet = useMemo(() => new Set(pins), [pins]);
  const keyword = query.trim().toLowerCase();

  const sections = useMemo(
    () =>
      categories
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((category) => {
          const all = items.filter((site) => site.categoryId === category.id);
          const visible = keyword ? all.filter((site) => matchesQuery(site, keyword)) : all;
          return { ...category, items: visible, total: all.length };
        }),
    [categories, items, keyword]
  );

  const visibleSections = useMemo(
    () => sections.filter((section) => section.items.length > 0 || !keyword),
    [sections, keyword]
  );

  const pinnedItems = useMemo(() => {
    const seen = new Set<string>();
    const list: SiteItem[] = [];
    pins.forEach((url) => {
      const site = byKey.get(url);
      if (site && !seen.has(url)) {
        seen.add(url);
        list.push(site);
      }
    });
    return keyword ? list.filter((site) => matchesQuery(site, keyword)) : list;
  }, [pins, byKey, keyword]);

  const navItems = useMemo<NavItem[]>(
    () =>
      sections.map((section) => ({
        id: section.id,
        name: section.name,
        icon: section.icon,
        count: section.total
      })),
    [sections]
  );

  const totalVisible =
    pinnedItems.length + visibleSections.reduce((sum, section) => sum + section.items.length, 0);

  /* ---------------- 当前选中分类跟随数据 ---------------- */
  useEffect(() => {
    if (!categories.length) return;
    if (!categories.some((category) => category.id === activeId)) {
      setActiveId(categories[0].id);
    }
  }, [categories, activeId]);

  /* ---------------- 滚动高亮当前分类 ---------------- */
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-section-id]'));
    if (!nodes.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const id = (entry.target as HTMLElement).dataset.sectionId;
          if (id) setActiveId(id);
        });
      },
      { rootMargin: '-120px 0px -62% 0px', threshold: 0 }
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [visibleSections]);

  /* ---------------- 快捷键 ---------------- */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName.toLowerCase() ?? '';
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select';

      const isSearchHotkey =
        (event.key === '/' && !typing) ||
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k');

      if (isSearchHotkey && !panelOpen && !modal.open) {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (event.key === 'Escape' && typing) {
        target?.blur();
        if (target === searchInputRef.current) setQuery('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [panelOpen, modal.open]);

  /* ---------------- 搜索 ---------------- */
  const handleSearch = useCallback(() => {
    const text = query.trim();
    if (!text) {
      searchInputRef.current?.focus();
      return;
    }
    const engine = engines.find((item) => item.id === engineId) ?? engines[0];
    if (!engine) {
      notify('还没有可用的搜索引擎，请在管理面板添加');
      return;
    }
    window.open(buildSearchUrl(engine.url, text), '_blank', 'noopener');
  }, [query, engines, engineId, notify]);

  const handleTogglePin = useCallback(
    async (site: SiteItem) => {
      try {
        const pinned = await actions.togglePin(site.url);
        notify(pinned ? '已加入「常用」' : '已取消收藏');
      } catch (error) {
        notify(errorText(error, '收藏失败，请稍后重试'));
      }
    },
    [actions, notify]
  );

  const handleEngineChange = useCallback(
    (id: string) => {
      void actions.setEngine(id).catch((error) => notify(errorText(error, '引擎切换失败')));
    },
    [actions, notify]
  );

  const handleToggleTheme = useCallback(async () => {
    try {
      await actions.toggleTheme();
    } catch (error) {
      notify(errorText(error, '主题保存失败'));
    }
  }, [actions, notify]);

  const handleNavigate = useCallback((id: string) => {
    setActiveId(id);
    setQuery('');
    window.requestAnimationFrame(() => {
      document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  /* ---------------- 站点弹窗 ---------------- */
  const openCreate = useCallback(
    (categoryId?: string) => {
      setModal({
        open: true,
        mode: 'create',
        site: null,
        categoryId: categoryId || activeId || categories[0]?.id || ''
      });
    },
    [activeId, categories]
  );

  const openEdit = useCallback((site: SiteItem) => {
    setModal({ open: true, mode: 'edit', site, categoryId: site.categoryId });
  }, []);

  const closeModal = useCallback(() => setModal(CLOSED_MODAL), []);

  const handleSubmitSite = useCallback(
    async (input: SiteInput, options: { pin: boolean }) => {
      const url = normalizeUrl(input.url);
      if (!url) {
        notify('请填写正确的网址');
        return;
      }

      const editing = modal.mode === 'edit' ? modal.site : null;
      const duplicated = items.some((item) => item.url === url && item.id !== editing?.id);
      if (duplicated) {
        notify('这个网址已经在导航里了');
        return;
      }

      try {
        if (editing) {
          const wasPinned = pins.includes(editing.url);
          const saved = await actions.updateSite(editing.id, { ...input, url });
          if (options.pin !== wasPinned) await actions.togglePin(saved.url);
          notify('站点已更新');
        } else {
          const created = await actions.createSite({ ...input, url });
          if (options.pin) await actions.togglePin(created.url);
          notify('站点已添加');
        }
        closeModal();
      } catch (error) {
        notify(errorText(error, '保存失败，请稍后重试'));
      }
    },
    [actions, closeModal, items, modal, notify, pins]
  );

  const handleDeleteSite = useCallback(
    async (site: SiteItem) => {
      if (!window.confirm(`确定删除「${site.name}」吗？该操作不可撤销。`)) return;
      try {
        await actions.deleteSite(site.id);
        notify('站点已删除');
        closeModal();
      } catch (error) {
        notify(errorText(error, '删除失败，请稍后重试'));
      }
    },
    [actions, closeModal, notify]
  );

  /* ---------------- 渲染 ---------------- */
  return (
    <>
      <div className={styles.bgDecor} aria-hidden="true">
        <span className={`${styles.blob} ${styles.blob1}`} />
        <span className={`${styles.blob} ${styles.blob2}`} />
        <span className={`${styles.blob} ${styles.blob3}`} />
      </div>

      <TopBar
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onAddClick={() => openCreate()}
        onManageClick={() => setPanelOpen(true)}
        search={{
          engines,
          engineId,
          onEngineChange: handleEngineChange,
          value: query,
          onChange: setQuery,
          onSubmit: handleSearch,
          inputRef: searchInputRef
        }}
      />

      <div className={styles.layout}>
        <Sidebar
          items={navItems}
          activeId={activeId}
          total={items.length}
          onSelect={handleNavigate}
          onManage={() => setPanelOpen(true)}
        />

        <main className={styles.content}>
          {offline && (
            <div className={styles.notice}>
              <span>未连接后端服务，数据无法读取与保存。</span>
              <button className="btn" type="button" onClick={() => void actions.reload()}>
                重新连接
              </button>
            </div>
          )}

          {loading ? (
            <div className={styles.loading}>
              <span className={styles.spinner} aria-hidden="true" />
              正在读取你的导航数据…
            </div>
          ) : (
            <>
              {pinnedItems.length > 0 && (
                <SectionBlock
                  id="pin"
                  name="常用"
                  icon="⭐"
                  items={pinnedItems}
                  total={pins.length}
                  variant="pin"
                  pinSet={pinSet}
                  onTogglePin={handleTogglePin}
                  onEdit={openEdit}
                />
              )}

              {visibleSections.map((section, index) => (
                <SectionBlock
                  key={section.id}
                  id={section.id}
                  name={section.name}
                  icon={section.icon}
                  items={section.items}
                  total={section.total}
                  delay={Math.min(index * 40, 240)}
                  pinSet={pinSet}
                  onTogglePin={handleTogglePin}
                  onEdit={openEdit}
                  onAddSite={openCreate}
                />
              ))}

              {keyword && totalVisible === 0 && sections.length > 0 && (
                <div className={styles.empty}>
                  <div className={styles.emptyEmoji}>🫧</div>
                  <p className={styles.emptyTitle}>没有匹配的站点</p>
                  <p className={styles.emptyDesc}>
                    换个关键词试试，或者直接搜索 — 用你选中的搜索引擎。
                  </p>
                  <button className="btn btn--primary" type="button" onClick={handleSearch}>
                    搜索一下
                  </button>
                </div>
              )}

              {!loading && sections.length === 0 && (
                <div className={styles.empty}>
                  <div className={styles.emptyEmoji}>📁</div>
                  <p className={styles.emptyTitle}>还没有任何分类</p>
                  <p className={styles.emptyDesc}>去管理面板新建一个分类，开始整理你的常用网站。</p>
                  <button className="btn btn--primary" type="button" onClick={() => setPanelOpen(true)}>
                    打开管理面板
                  </button>
                </div>
              )}
            </>
          )}

          <footer className={styles.footer}>
            <p>
              数据保存在本地 SQLite（<code>data/navpage.db</code>）· 分类、站点与搜索引擎都可以在「管理」里增删改
            </p>
            <p className={styles.footerDim}>NavPage — 少一点广告，少一点点击。</p>
          </footer>
        </main>
      </div>

      <SiteModal
        open={modal.open}
        mode={modal.mode}
        site={modal.site}
        categories={categories}
        defaultCategoryId={modal.categoryId}
        pinned={modal.site ? pins.includes(modal.site.url) : false}
        onClose={closeModal}
        onSubmit={handleSubmitSite}
        onDelete={handleDeleteSite}
      />

      <SettingsPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </>
  );
}

export default function App() {
  return (
    <NavProvider>
      <ToastProvider>
        <NavPage />
      </ToastProvider>
    </NavProvider>
  );
}
