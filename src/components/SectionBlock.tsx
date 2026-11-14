import type { SiteItem } from '../types';
import { SiteCard } from './SiteCard';
import styles from './SectionBlock.module.css';

interface SectionBlockProps {
  /** 分类 id，用于侧边栏滚动定位；「常用」区不参与定位 */
  id: string;
  name: string;
  icon: string;
  items: SiteItem[];
  total: number;
  pinSet: Set<string>;
  onTogglePin: (site: SiteItem) => void;
  onEdit: (site: SiteItem) => void;
  /** 空分类时展示「添加站点」入口 */
  onAddSite?: (categoryId: string) => void;
  variant?: 'default' | 'pin';
  delay?: number;
}

export function SectionBlock({
  id,
  name,
  icon,
  items,
  total,
  pinSet,
  onTogglePin,
  onEdit,
  onAddSite,
  variant = 'default',
  delay = 0
}: SectionBlockProps) {
  const isPin = variant === 'pin';

  return (
    <section
      className={`${styles.section} ${isPin ? styles.pinned : ''}`}
      id={isPin ? undefined : `cat-${id}`}
      data-section-id={isPin ? undefined : id}
      style={{ animationDelay: `${delay}ms` }}
    >
      <header className={styles.head}>
        <h2 className={styles.title}>
          <span className={styles.icon} aria-hidden="true">
            {icon}
          </span>
          {name}
        </h2>
        <span className={styles.count}>
          {items.length !== total ? `${items.length} / ${total} 个` : `${total} 个`}
        </span>
      </header>

      {items.length === 0 ? (
        <div className={styles.blank}>
          <span>这个分类还是空的</span>
          {onAddSite && (
            <button className={styles.blankBtn} type="button" onClick={() => onAddSite(id)}>
              添加第一个站点
            </button>
          )}
        </div>
      ) : (
        <div className={styles.grid}>
          {items.map((site) => (
            <SiteCard
              key={site.id}
              site={site}
              pinned={pinSet.has(site.url)}
              onTogglePin={onTogglePin}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
    </section>
  );
}
