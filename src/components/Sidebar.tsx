import { SlidersIcon } from './icons';
import styles from './Sidebar.module.css';

export interface NavItem {
  id: string;
  name: string;
  icon: string;
  count: number;
}

interface SidebarProps {
  items: NavItem[];
  activeId: string;
  total: number;
  onSelect: (id: string) => void;
  onManage: () => void;
}

export function Sidebar({ items, activeId, total, onSelect, onManage }: SidebarProps) {
  return (
    <aside className={styles.sidebar}>
      <nav className={styles.catNav} aria-label="分类导航">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`${styles.item} ${activeId === item.id ? styles.itemActive : ''}`}
            onClick={() => onSelect(item.id)}
          >
            <span className={styles.icon} aria-hidden="true">
              {item.icon}
            </span>
            <span className={styles.name}>{item.name}</span>
            <span className={styles.num}>{item.count}</span>
          </button>
        ))}
      </nav>

      <div className={styles.foot}>
        <span>{total} 个站点</span>
        <span className={styles.dot} aria-hidden="true" />
        <button className={styles.manage} type="button" onClick={onManage}>
          <SlidersIcon size={13} />
          管理
        </button>
      </div>
    </aside>
  );
}
