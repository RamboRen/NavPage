import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { authApi } from '../api/auth';
import { PALETTES, RADIUS_OPTIONS } from '../theme/appearance';
import type { AdminUserRecord, CategoryRecord, RadiusStyle, Theme, UserRole } from '../types';
import { useAuth } from '../store/AuthStore';
import { useNav } from '../store/NavStore';
import { ArrowDownIcon, ArrowUpIcon, CloseIcon, PencilIcon, PlusIcon, TrashIcon } from './icons';
import { useToast } from './Toast';
import styles from './SettingsPanel.module.css';

export type SettingsTab = 'category' | 'engine' | 'appearance' | 'data' | 'user';

const TABS: { id: SettingsTab; label: string; adminOnly?: boolean }[] = [
  { id: 'category', label: '分类' },
  { id: 'engine', label: '搜索引擎' },
  { id: 'appearance', label: '外观' },
  { id: 'data', label: '数据' },
  { id: 'user', label: '用户', adminOnly: true }
];

interface SettingsPanelProps {
  open: boolean;
  tab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  onClose: () => void;
}

/** 账号密码重置的最小长度，和后端保持一致 */
const PASSWORD_MIN = 6;
const USERNAME_RE = /^[a-zA-Z0-9_\u4e00-\u9fa5-]{2,20}$/;

const gradientOf = (text: string) => {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) % 360;
  return `linear-gradient(135deg, hsl(${hash} 76% 62%), hsl(${(hash + 46) % 360} 72% 54%))`;
};

const initialOf = (text: string) => [...text][0]?.toUpperCase() ?? 'N';

const dateOf = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export function SettingsPanel({ open, tab, onTabChange, onClose }: SettingsPanelProps) {
  const notify = useToast();
  const { state, actions } = useNav();
  const { state: authState } = useAuth();
  const { categories, sites, pins, engines, engineId, theme, appearance } = state;
  const currentUser = authState.user;
  const isAdmin = currentUser?.role === 'admin';

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

  // 账号（仅超级管理员）
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', displayName: '', password: '', role: 'user' as UserRole });
  const [resettingId, setResettingId] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState('');

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
    setResettingId(null);
    setResetPassword('');
    setNewUser({ username: '', displayName: '', password: '', role: 'user' });
  }, [open]);

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    setUsersLoading(true);
    try {
      const { users: list } = await authApi.listUsers();
      setUsers(list);
    } catch (error) {
      notify(error instanceof Error ? error.message : '账号列表读取失败');
    } finally {
      setUsersLoading(false);
    }
  }, [isAdmin, notify]);

  useEffect(() => {
    if (open && tab === 'user' && isAdmin) void loadUsers();
  }, [open, tab, isAdmin, loadUsers]);

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

  const visibleTabs = useMemo(() => TABS.filter((item) => !item.adminOnly || isAdmin), [isAdmin]);

  const run = async (task: () => Promise<unknown>, success?: string) => {
    if (busy) return false;
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

  /* ---------------- 账号 ---------------- */

  const submitUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const username = newUser.username.trim();
    if (!USERNAME_RE.test(username)) {
      notify('账号需为 2-20 位字母、数字、下划线、短横线或中文');
      return;
    }
    if (newUser.password.length < PASSWORD_MIN) {
      notify(`密码至少 ${PASSWORD_MIN} 位`);
      return;
    }

    const ok = await run(
      () =>
        authApi.createUser({
          username,
          password: newUser.password,
          displayName: newUser.displayName.trim() || undefined,
          role: newUser.role
        }),
      '账号已创建，可以直接登录'
    );
    if (ok) {
      setNewUser({ username: '', displayName: '', password: '', role: 'user' });
      void loadUsers();
    }
  };

  const toggleUserRole = async (record: AdminUserRecord) => {
    const next: UserRole = record.role === 'admin' ? 'user' : 'admin';
    const ok = await run(
      () => authApi.updateUser(record.id, { role: next }),
      next === 'admin' ? '已设为超级管理员' : '已设为普通用户'
    );
    if (ok) void loadUsers();
  };

  const saveResetPassword = async (record: AdminUserRecord) => {
    if (resetPassword.length < PASSWORD_MIN) {
      notify(`密码至少 ${PASSWORD_MIN} 位`);
      return;
    }
    const ok = await run(
      () => authApi.updateUser(record.id, { password: resetPassword }),
      `已重置「${record.displayName}」的密码`
    );
    if (ok) {
      setResettingId(null);
      setResetPassword('');
    }
  };

  const removeUser = async (record: AdminUserRecord) => {
    if (
      !window.confirm(
        `确定删除账号「${record.displayName}（@${record.username}）」吗？该账号的分类、站点与收藏会一并删除，且不可撤销。`
      )
    ) {
      return;
    }
    const ok = await run(() => authApi.deleteUser(record.id), '账号已删除');
    if (ok) void loadUsers();
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
            <p>{isAdmin ? '所有改动即时保存到本地数据库' : '站点与外观设置即时保存到本地数据库'}</p>
          </div>
          <button className="icon-btn icon-btn--ghost" type="button" onClick={onClose} aria-label="关闭">
            <CloseIcon size={15} />
          </button>
        </header>

        <div className={styles.tabs} role="tablist">
          {visibleTabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={`${styles.tab} ${tab === item.id ? styles.tabActive : ''}`}
              onClick={() => onTabChange(item.id)}
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

          {/* -------------------- 用户（仅超级管理员） -------------------- */}
          {tab === 'user' && isAdmin && (
            <section className={styles.section}>
              <p className={styles.hint}>
                系统不开放注册，账号都在这里创建。新账号会自动带上出厂分类与推荐站点；删除账号会一并删除它的全部数据，不可撤销。
              </p>

              <form className={styles.userForm} onSubmit={submitUser}>
                <input
                  className={styles.textInput}
                  value={newUser.username}
                  onChange={(event) => setNewUser((prev) => ({ ...prev, username: event.target.value }))}
                  placeholder="账号，2-20 位"
                  aria-label="新账号"
                  autoComplete="off"
                />
                <input
                  className={styles.textInput}
                  value={newUser.displayName}
                  onChange={(event) => setNewUser((prev) => ({ ...prev, displayName: event.target.value }))}
                  placeholder="昵称（可选）"
                  maxLength={20}
                  aria-label="昵称"
                  autoComplete="off"
                />
                <input
                  className={styles.textInput}
                  type="password"
                  value={newUser.password}
                  onChange={(event) => setNewUser((prev) => ({ ...prev, password: event.target.value }))}
                  placeholder={`初始密码，至少 ${PASSWORD_MIN} 位`}
                  aria-label="初始密码"
                  autoComplete="new-password"
                />
                <div className={styles.userFormRow}>
                  <select
                    className={styles.select}
                    value={newUser.role}
                    onChange={(event) =>
                      setNewUser((prev) => ({ ...prev, role: event.target.value as UserRole }))
                    }
                    aria-label="账号角色"
                  >
                    <option value="user">普通用户</option>
                    <option value="admin">超级管理员</option>
                  </select>
                  <button
                    className="btn btn--primary"
                    type="submit"
                    disabled={busy || !newUser.username.trim() || newUser.password.length < PASSWORD_MIN}
                  >
                    <PlusIcon size={15} />
                    创建账号
                  </button>
                </div>
              </form>

              {usersLoading ? (
                <p className={styles.hint}>正在读取账号…</p>
              ) : (
                <ul className={styles.list}>
                  {users.map((record) => {
                    const self = record.id === currentUser?.id;
                    return (
                      <li key={record.id} className={styles.item}>
                        <div className={styles.row}>
                          <span
                            className={styles.userAvatar}
                            style={{ backgroundImage: gradientOf(record.username) }}
                            aria-hidden="true"
                          >
                            {initialOf(record.displayName || record.username)}
                          </span>
                          <div className={styles.info}>
                            <strong>
                              {record.displayName}
                              {record.role === 'admin' && <em className={styles.badge}>超级管理员</em>}
                              {self && <em className={styles.badge}>当前</em>}
                            </strong>
                            <small>
                              @{record.username} · {record.siteCount} 个站点
                              {record.createdAt ? ` · ${dateOf(record.createdAt)} 加入` : ''}
                            </small>
                          </div>
                          <div className={styles.rowActions}>
                            <button
                              className={styles.ghostBtn}
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setResettingId(record.id);
                                setResetPassword('');
                              }}
                              title="设置一个新密码"
                            >
                              重置密码
                            </button>
                            {!self && (
                              <button
                                className={styles.ghostBtn}
                                type="button"
                                disabled={busy}
                                onClick={() => void toggleUserRole(record)}
                              >
                                {record.role === 'admin' ? '取消管理员' : '设为管理员'}
                              </button>
                            )}
                            <button
                              className={`${styles.iconAction} ${styles.iconDanger}`}
                              type="button"
                              onClick={() => void removeUser(record)}
                              disabled={busy || self}
                              title={self ? '不能删除当前登录的账号' : '删除账号'}
                              aria-label="删除账号"
                            >
                              <TrashIcon size={14} />
                            </button>
                          </div>
                        </div>

                        {resettingId === record.id && (
                          <div className={styles.inlinePanel}>
                            <div className={styles.confirmRow}>
                              <input
                                className={styles.textInput}
                                type="password"
                                value={resetPassword}
                                onChange={(event) => setResetPassword(event.target.value)}
                                placeholder={`新密码，至少 ${PASSWORD_MIN} 位`}
                                aria-label="新密码"
                                autoComplete="new-password"
                              />
                              <button
                                className={styles.ghostBtn}
                                type="button"
                                disabled={busy || resetPassword.length < PASSWORD_MIN}
                                onClick={() => void saveResetPassword(record)}
                              >
                                保存
                              </button>
                              <button
                                className={styles.ghostBtn}
                                type="button"
                                onClick={() => setResettingId(null)}
                              >
                                取消
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              <p className={styles.footNote}>
                密码使用 scrypt 加盐哈希存储；重置密码后，对方在所有设备上的会话都会失效。至少要保留一个超级管理员。
              </p>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}
