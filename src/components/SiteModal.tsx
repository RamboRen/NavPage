import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { CategoryRecord, SiteInput, SiteItem } from '../types';
import { TrashIcon } from './icons';
import styles from './SiteModal.module.css';

const SWATCHES = ['#4f6bf5', '#8b5cf6', '#f43f5e', '#f59e0b', '#10b981', '#0ea5e9'];

interface SiteModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  /** 编辑模式下的原始站点 */
  site: SiteItem | null;
  categories: CategoryRecord[];
  defaultCategoryId: string;
  /** 当前是否已收藏（编辑模式下用于初始化勾选框） */
  pinned: boolean;
  onClose: () => void;
  onSubmit: (input: SiteInput, options: { pin: boolean }) => Promise<void>;
  onDelete: (site: SiteItem) => Promise<void>;
}

interface FormState {
  name: string;
  url: string;
  desc: string;
  categoryId: string;
  color: string;
  pin: boolean;
}

export function SiteModal({
  open,
  mode,
  site,
  categories,
  defaultCategoryId,
  pinned,
  onClose,
  onSubmit,
  onDelete
}: SiteModalProps) {
  const [form, setForm] = useState<FormState>({
    name: '',
    url: '',
    desc: '',
    categoryId: defaultCategoryId,
    color: '',
    pin: false
  });
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // 每次打开时用当前站点（或空值）重置表单
  useEffect(() => {
    if (!open) return;
    setSaving(false);
    setForm(
      mode === 'edit' && site
        ? {
            name: site.name,
            url: site.url,
            desc: site.desc,
            categoryId: site.categoryId,
            color: site.color ?? '',
            pin: pinned
          }
        : {
            name: '',
            url: '',
            desc: '',
            categoryId: defaultCategoryId || categories[0]?.id || '',
            color: '',
            pin: false
          }
    );
    const timer = window.setTimeout(() => nameRef.current?.focus(), 60);
    return () => window.clearTimeout(timer);
  }, [open, mode, site, defaultCategoryId, pinned, categories]);

  // Esc 关闭 + 锁定页面滚动
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

  if (!open) return null;

  const update = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = form.name.trim();
    const url = form.url.trim();
    if (!name || !url || saving) return;

    setSaving(true);
    try {
      await onSubmit(
        {
          name,
          url,
          desc: form.desc.trim(),
          categoryId: form.categoryId,
          color: form.color || undefined
        },
        { pin: form.pin }
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!site || saving) return;
    setSaving(true);
    try {
      await onDelete(site);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.modal}>
      <div className={styles.mask} onClick={onClose} />
      <div className={styles.panel} role="dialog" aria-modal="true" aria-labelledby="site-modal-title">
        <header className={styles.head}>
          <div>
            <h3 id="site-modal-title">{mode === 'edit' ? '编辑网站' : '添加网站'}</h3>
            {mode === 'edit' && <p className={styles.sub}>{site?.url}</p>}
          </div>
          <button className="icon-btn icon-btn--ghost" type="button" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </header>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.row}>
            <label className={styles.field}>
              <span>
                名称 <i className={styles.required}>*</i>
              </span>
              <input
                ref={nameRef}
                type="text"
                value={form.name}
                onChange={(event) => update({ name: event.target.value })}
                placeholder="例如：掘金"
                maxLength={20}
                required
              />
            </label>

            <label className={styles.field}>
              <span>
                分类 <i className={styles.required}>*</i>
              </span>
              <select
                value={form.categoryId}
                onChange={(event) => update({ categoryId: event.target.value })}
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.icon} {category.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className={styles.field}>
            <span>
              网址 <i className={styles.required}>*</i>
            </span>
            <input
              type="text"
              value={form.url}
              onChange={(event) => update({ url: event.target.value })}
              placeholder="例如：juejin.cn"
              required
            />
          </label>

          <label className={styles.field}>
            <span>说明</span>
            <input
              type="text"
              value={form.desc}
              onChange={(event) => update({ desc: event.target.value })}
              placeholder="一句话描述（可不填）"
              maxLength={36}
            />
          </label>

          <div className={styles.field}>
            <span>图标底色</span>
            <div className={styles.swatches}>
              <button
                type="button"
                className={`${styles.swatchAuto} ${form.color ? '' : styles.swatchOn}`}
                onClick={() => update({ color: '' })}
                title="按名称自动配色"
              >
                自动
              </button>
              {SWATCHES.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`${styles.swatch} ${form.color === color ? styles.swatchOn : ''}`}
                  style={{ background: color }}
                  onClick={() => update({ color })}
                  aria-label={`使用颜色 ${color}`}
                />
              ))}
              <label className={styles.colorPick} title="自定义颜色">
                <input
                  type="color"
                  value={form.color || '#4f6bf5'}
                  onChange={(event) => update({ color: event.target.value })}
                />
                <span>+</span>
              </label>
            </div>
          </div>

          <label className={styles.check}>
            <input
              type="checkbox"
              checked={form.pin}
              onChange={(event) => update({ pin: event.target.checked })}
            />
            <span>同时收藏到「常用」</span>
          </label>

          <div className={styles.foot}>
            {mode === 'edit' ? (
              <button
                className={styles.danger}
                type="button"
                onClick={handleDelete}
                disabled={saving}
              >
                <TrashIcon size={14} />
                删除站点
              </button>
            ) : (
              <span className={styles.tip}>网址不写 https:// 会自动补全</span>
            )}

            <div className={styles.footRight}>
              <button type="button" className="btn" onClick={onClose} disabled={saving}>
                取消
              </button>
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
