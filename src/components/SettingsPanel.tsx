import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { PALETTES, RADIUS_OPTIONS } from '../theme/appearance';
import type { CategoryRecord, RadiusStyle, Theme } from '../types';
import { useNav } from '../store/NavStore';
import { ArrowDownIcon, ArrowUpIcon, CloseIcon, PencilIcon, PlusIcon, TrashIcon } from './icons';
import { useToast } from './Toast';
import styles from './SettingsPanel.module.css';

type Tab = 'category' | 'engine' | 'appearance' | 'data';

const TABS: { id: Tab; label: string }[] = [
  { id: 'category', label: '分类' },
  { id: 'engine', label: '搜索引擎' },
  { id: 'appearance', label: '外观' },
  { id: 'data', label: '数据' }
];

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const notify = useToast();
  const { state, actions } = useNav();
  const { categories, sites, pins, engines, engineId, theme, appearance } = state;

  const [tab, setTab] = useState<Tab>('category');
  const [busy, setBusy] = useState(false);

  // 分类
  const [newCategory, setNewCategory] = useState({ name: '', icon: '📁' });
  const [editingCategory, setEditingCategory] = useState<{ id: string; name: string; icon: string } | null>(
    null
  );
  const [deletingCategory, setDeletingCategory] = useState<CategoryRecord | null>(null);
  const [moveTo, setMoveTo] = useState('');

  // 引擎
  const [newEngine, setNewEngine] = useState({ name: '', url: '' });
  const [editingEngine, setEditingEngine] = useState<{ id: string; name: string; url: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  // 关闭时清掉临时编辑态，下次打开是干净的
  useEffect(() => {
    if (open) return;
    setEditingCategory(null);
    setEditingEngine(null);
    setDeletingCategory(null);
    setNewCategory({ name: '', icon: '📁' });
    setNewEngine({ name: '', url: '' });
  }, [open]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    sites.forEach((site) => {
      map[site.categoryId] = (map[site.categoryId] ?? 0) + 1;
    });
    return map;
  }, [sites]);

  const orderedCategories = useMemo(
    () => [...categories].sort((a, b) => a.position - b.position),
    [categories]
  );

  const run = async (task: () => Promise<unknown>, success?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await task();
      if (success) notify(success);
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : '操作失败');
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  /* ---------------- 分类 ---------------- */

  const submitCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newCategory.name.trim();
    if (!name) return;
    const ok = await run(
      () => actions.createCategory({ name, icon: newCategory.icon.trim() || '📁' }),
      '分类已添加'
    );
    if (ok) setNewCategory({ name: '', icon: '📁' });
  };

  const saveCategoryEdit = async () => {
    if (!editingCategory) return;
    const ok = await run(
      () =>
        actions.updateCategory(editingCategory.id, {
          name: editingCategory.name.trim(),
          icon: editingCategory.icon.trim() || '📁'
        }),
      '分类已更新'
    );
    if (ok) setEditingCategory(null);
  };

  const confirmDeleteCategory = async (force: boolean) => {
    if (!deletingCategory) return;
    const ok = await run(
      () =>
        actions.deleteCategory(
          deletingCategory.id,
          force ? { force: true } : { moveTo }
        ),
      force ? '分类与其中的站点已删除' : '站点已迁移，分类已删除'
    );
    if (ok) {
      setDeletingCategory(null);
      setMoveTo('');
    }
  };

  /* ---------------- 引擎 ---------------- */

  const submitEngine = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newEngine.name.trim();
    const url = newEngine.url.trim();
    if (!name || !url) return;
    const ok = await run(() => actions.createEngine({ name, url }), '搜索引擎已添加');
    if (ok) setNewEngine({ name: '', url: '' });
  };

  const saveEngineEdit = async () => {
    if (!editingEngine) return;
    const ok = await run(
      () =>
        actions.updateEngine(editingEngine.id, {
          name: editingEngine.name.trim(),
          url: editingEngine.url.trim()
        }),
      '搜索引擎已更新'
    );
    if (ok) setEditingEngine(null);
  };

  /* ---------------- 外观 ---------------- */

  const changeTheme = (next: Theme) => {
    if (next === theme) return;
    void actions.toggleTheme().catch((error) => notify(String((error as Error).message || '主题保存失败')));
  };

  const changeRadius = (radius: RadiusStyle) => {
    actions.setAppearance({ radius });
  };

  /* ---------------- 数据 ---------------- */

  const restorePins = () => {
    const hotUrls = sites.filter((site) => site.hot).map((site) => site.url);
    if (!hotUrls.length) {
      notify('当前没有可恢复的推荐站点');
      return;
    }
    void run(() => actions.replacePins(hotUrls), '已恢复默认收藏');
  };

  const exportBackup = () => {
    const payload = {
      version: 3,
      exportedAt: new Date().toISOString(),
      categories,
      sites,
      engines,
      pins,
      preferences: { theme, palette: appearance.palette, radius: appearance.radius, engine: engineId }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `navpage-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    notify('备份已导出');
  };

  const resetAll = () => {
    if (!window.confirm('恢复出厂设置会删除所有自定义分类、站点与收藏，且无法撤销。确定继续？')) return;
    void run(() => actions.resetAll(), '已恢复出厂数据');
  };

  /* ---------------- 渲染 ---------------- */

  return (
    <div className={styles.root}>
      <div className={styles.mask} onClick={onClose} />

      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-label="管理面板">
        <header className={styles.head}>
          <div>
            <h3>管理面板</h3>
            <p>所有改动即时保存到本地数据库</p>
          </div>
          <button className="icon-btn icon-btn--ghost" type="button" onClick={onClose} aria-label="关闭">
            <CloseIcon size={15} />
          </button>
        </header>

        <div className={styles.tabs} role="tablist">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={`${styles.tab} ${tab === item.id ? styles.tabActive : ''}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className={styles.body}>
          {/* -------------------- 分类 -------------------- */}
          {tab === 'category' && (
            <section className={styles.section}>
              <p className={styles.hint}>
                分类决定侧边栏与页面的分组顺序，可以直接在这里改名、换图标、调顺序。
              </p>

              <form className={styles.addRow} onSubmit={submitCategory}>
                <input
                  className={styles.iconInput}
                  value={newCategory.icon}
                  onChange={(event) => setNewCategory((prev) => ({ ...prev, icon: event.target.value }))}
                  maxLength={4}
                  aria-label="分类图标"
                  placeholder="📁"
                />
                <input
                  className={styles.textInput}
                  value={newCategory.name}
                  onChange={(event) => setNewCategory((prev) => ({ ...prev, name: event.target.value }))}
                  maxLength={12}
                  placeholder="新分类名称，例如：投资理财"
                  aria-label="新分类名称"
                />
                <button className="btn btn--primary" type="submit" disabled={busy || !newCategory.name.trim()}>
                  <PlusIcon size={15} />
                  添加
                </button>
              </form>

              <ul className={styles.list}>
                {orderedCategories.map((category, index) => {
                  const count = counts[category.id] ?? 0;
                  const editing = editingCategory?.id === category.id;
                  const deleting = deletingCategory?.id === category.id;

                  return (
                    <li key={category.id} className={styles.item}>
                      {editing ? (
                        <div className={styles.editRow}>
                          <input
                            className={styles.iconInput}
                            value={editingCategory.icon}
                            onChange={(event) =>
                              setEditingCategory((prev) => (prev ? { ...prev, icon: event.target.value } : prev))
                            }
                            maxLength={4}
                            aria-label="分类图标"
                          />
                          <input
                            className={styles.textInput}
                            value={editingCategory.name}
                            onChange={(event) =>
                              setEditingCategory((prev) => (prev ? { ...prev, name: event.target.value } : prev))
                            }
                            maxLength={12}
                            aria-label="分类名称"
                            autoFocus
                          />
                          <button
                            className={styles.ghostBtn}
                            type="button"
                            onClick={saveCategoryEdit}
                            disabled={busy || !editingCategory.name.trim()}
                          >
                            保存
                          </button>
                          <button
                            className={styles.ghostBtn}
                            type="button"
                            onClick={() => setEditingCategory(null)}
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <div className={styles.row}>
                          <span className={styles.emoji} aria-hidden="true">
                            {category.icon}
                          </span>
                          <div className={styles.info}>
                            <strong>{category.name}</strong>
                            <small>{count} 个站点</small>
                          </div>
                          <div className={styles.rowActions}>
                            <button
                              className={styles.iconAction}
                              type="button"
                              onClick={() => void run(() => actions.moveCategory(category.id, -1))}
                              disabled={busy || index === 0}
                              title="上移"
                              aria-label="上移"
                            >
                              <ArrowUpIcon />
                            </button>
                            <button
                              className={styles.iconAction}
                              type="button"
                              onClick={() => void run(() => actions.moveCategory(category.id, 1))}
                              disabled={busy || index === orderedCategories.length - 1}
                              title="下移"
                              aria-label="下移"
                            >
                              <ArrowDownIcon />
                            </button>
                            <button
                              className={styles.iconAction}
                              type="button"
                              onClick={() =>
                                setEditingCategory({
                                  id: category.id,
                                  name: category.name,
                                  icon: category.icon
                                })
                              }
                              title="编辑"
                              aria-label="编辑分类"
                            >
                              <PencilIcon />
                            </button>
                            <button
                              className={`${styles.iconAction} ${styles.iconDanger}`}
                              type="button"
                              onClick={() => {
                                setDeletingCategory(category);
                                setMoveTo('');
                              }}
                              title="删除"
                              aria-label="删除分类"
                            >
                              <TrashIcon size={14} />
                            </button>
                          </div>
                        </div>
                      )}

                      {deleting && (
                        <div className={styles.confirm}>
                          {count > 0 ? (
                            <>
                              <p>
                                「{category.name}」下还有 <strong>{count}</strong> 个站点，请选择处理方式：
                              </p>
                              <div className={styles.confirmRow}>
                                <select
                                  className={styles.select}
                                  value={moveTo}
                                  onChange={(event) => setMoveTo(event.target.value)}
                                  aria-label="迁移到的分类"
                                >
                                  <option value="">选择要迁移到的分类…</option>
                                  {orderedCategories
                                    .filter((item) => item.id !== category.id)
                                    .map((item) => (
                                      <option key={item.id} value={item.id}>
                                        {item.icon} {item.name}
                                      </option>
                                    ))}
                                </select>
                                <button
                                  className={styles.ghostBtn}
                                  type="button"
                                  disabled={busy || !moveTo}
                                  onClick={() => void confirmDeleteCategory(false)}
                                >
                                  迁移后删除
                                </button>
                                <button
                                  className={styles.dangerBtn}
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void confirmDeleteCategory(true)}
                                >
                                  一起删除
                                </button>
                                <button
                                  className={styles.ghostBtn}
                                  type="button"
                                  onClick={() => setDeletingCategory(null)}
                                >
                                  取消
                                </button>
                              </div>
                            </>
                          ) : (
                            <div className={styles.confirmRow}>
                              <p>确定删除空分类「{category.name}」？</p>
                              <button
                                className={styles.dangerBtn}
                                type="button"
                                disabled={busy}
                                onClick={() => void confirmDeleteCategory(true)}
                              >
                                删除
                              </button>
                              <button
                                className={styles.ghostBtn}
                                type="button"
                                onClick={() => setDeletingCategory(null)}
                              >
                                取消
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* -------------------- 搜索引擎 -------------------- */}
          {tab === 'engine' && (
            <section className={styles.section}>
              <p className={styles.hint}>
                搜索地址里用 <code>{'{q}'}</code> 表示关键词位置，回车后会用当前引擎打开新标签页。
              </p>

              <form className={styles.addRow} onSubmit={submitEngine}>
                <input
                  className={styles.shortInput}
                  value={newEngine.name}
                  onChange={(event) => setNewEngine((prev) => ({ ...prev, name: event.target.value }))}
                  maxLength={16}
                  placeholder="名称"
                  aria-label="引擎名称"
                />
                <input
                  className={styles.textInput}
                  value={newEngine.url}
                  onChange={(event) => setNewEngine((prev) => ({ ...prev, url: event.target.value }))}
                  placeholder="https://example.com/search?q={q}"
                  aria-label="搜索地址"
                />
                <button
                  className="btn btn--primary"
                  type="submit"
                  disabled={busy || !newEngine.name.trim() || !newEngine.url.trim()}
                >
                  <PlusIcon size={15} />
                  添加
                </button>
              </form>

              <ul className={styles.list}>
                {engines.map((engine) => {
                  const editing = editingEngine?.id === engine.id;
                  return (
                    <li key={engine.id} className={styles.item}>
                      {editing ? (
                        <div className={styles.editRow}>
                          <input
                            className={styles.shortInput}
                            value={editingEngine.name}
                            onChange={(event) =>
                              setEditingEngine((prev) => (prev ? { ...prev, name: event.target.value } : prev))
                            }
                            maxLength={16}
                            aria-label="引擎名称"
                          />
                          <input
                            className={styles.textInput}
                            value={editingEngine.url}
                            onChange={(event) =>
                              setEditingEngine((prev) => (prev ? { ...prev, url: event.target.value } : prev))
                            }
                            aria-label="搜索地址"
                          />
                          <button
                            className={styles.ghostBtn}
                            type="button"
                            onClick={saveEngineEdit}
                            disabled={busy}
                          >
                            保存
                          </button>
                          <button className={styles.ghostBtn} type="button" onClick={() => setEditingEngine(null)}>
                            取消
                          </button>
                        </div>
                      ) : (
                        <div className={styles.row}>
                          <div className={styles.info}>
                            <strong>
                              {engine.name}
                              {engine.id === engineId && <em className={styles.badge}>当前</em>}
                            </strong>
                            <small className={styles.mono}>{engine.url}</small>
                          </div>
                          <div className={styles.rowActions}>
                            <button
                              className={styles.iconAction}
                              type="button"
                              onClick={() =>
                                setEditingEngine({ id: engine.id, name: engine.name, url: engine.url })
                              }
                              title="编辑"
                              aria-label="编辑引擎"
                            >
                              <PencilIcon />
                            </button>
                            <button
                              className={`${styles.iconAction} ${styles.iconDanger}`}
                              type="button"
                              onClick={() => void run(() => actions.deleteEngine(engine.id), '搜索引擎已删除')}
                              disabled={busy || engines.length <= 1}
                              title={engines.length <= 1 ? '至少要保留一个引擎' : '删除'}
                              aria-label="删除引擎"
                            >
                              <TrashIcon size={14} />
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* -------------------- 外观 -------------------- */}
          {tab === 'appearance' && (
            <section className={styles.section}>
              <div className={styles.group}>
                <h4>配色主题</h4>
                <p className={styles.hint}>主题色会同时影响按钮、高亮、背景光晕与收藏区。</p>
                <div className={styles.palettes}>
                  {PALETTES.map((item) => (
                    <button
                      key={item.color}
                      type="button"
                      className={`${styles.palette} ${
                        appearance.palette.toLowerCase() === item.color ? styles.paletteOn : ''
                      }`}
                      onClick={() => actions.setAppearance({ palette: item.color })}
                      title={item.name}
                    >
                      <span className={styles.dot} style={{ background: item.color }} />
                      {item.name}
                    </button>
                  ))}
                  <label className={`${styles.palette} ${styles.paletteCustom}`}>
                    <input
                      type="color"
                      value={appearance.palette}
                      onChange={(event) => actions.setAppearance({ palette: event.target.value })}
                      aria-label="自定义主题色"
                    />
                    自定义
                  </label>
                </div>
              </div>

              <div className={styles.group}>
                <h4>圆角</h4>
                <div className={styles.segments}>
                  {RADIUS_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`${styles.segment} ${appearance.radius === option.id ? styles.segmentOn : ''}`}
                      onClick={() => changeRadius(option.id)}
                    >
                      <span
                        className={styles.radiusPreview}
                        style={{ borderRadius: option.value[1] }}
                        aria-hidden="true"
                      />
                      {option.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.group}>
                <h4>明暗模式</h4>
                <div className={styles.segments}>
                  {(['light', 'dark'] as Theme[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={`${styles.segment} ${theme === mode ? styles.segmentOn : ''}`}
                      onClick={() => changeTheme(mode)}
                    >
                      {mode === 'light' ? '浅色' : '深色'}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.preview}>
                <span className={styles.previewIcon}>N</span>
                <div>
                  <strong>预览</strong>
                  <small>配色与圆角会立即生效</small>
                </div>
                <span className={styles.previewChip}>示例按钮</span>
              </div>
            </section>
          )}

          {/* -------------------- 数据 -------------------- */}
          {tab === 'data' && (
            <section className={styles.section}>
              <div className={styles.stats}>
                <div className={styles.stat}>
                  <strong>{orderedCategories.length}</strong>
                  <small>分类</small>
                </div>
                <div className={styles.stat}>
                  <strong>{sites.length}</strong>
                  <small>站点</small>
                </div>
                <div className={styles.stat}>
                  <strong>{pins.length}</strong>
                  <small>常用</small>
                </div>
                <div className={styles.stat}>
                  <strong>{engines.length}</strong>
                  <small>引擎</small>
                </div>
              </div>

              <div className={styles.group}>
                <h4>维护</h4>
                <div className={styles.actionList}>
                  <div className={styles.actionRow}>
                    <div>
                      <strong>恢复默认收藏</strong>
                      <small>把「常用」重置为出厂推荐的站点</small>
                    </div>
                    <button className={styles.ghostBtn} type="button" onClick={restorePins} disabled={busy}>
                      恢复
                    </button>
                  </div>

                  <div className={styles.actionRow}>
                    <div>
                      <strong>导出备份</strong>
                      <small>下载包含分类、站点、引擎与偏好的 JSON 文件</small>
                    </div>
                    <button className={styles.ghostBtn} type="button" onClick={exportBackup}>
                      导出
                    </button>
                  </div>

                  <div className={styles.actionRow}>
                    <div>
                      <strong>恢复出厂设置</strong>
                      <small>清空所有自定义内容并重新写入默认数据，不可撤销</small>
                    </div>
                    <button className={styles.dangerBtn} type="button" onClick={resetAll} disabled={busy}>
                      重置
                    </button>
                  </div>
                </div>
              </div>

              <p className={styles.footNote}>
                数据保存在 <code>data/navpage.db</code>，直接复制该文件即可完成整站备份。
              </p>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}
