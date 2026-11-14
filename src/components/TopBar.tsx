import type { Theme } from '../types';
import { SearchBar } from './SearchBar';
import type { SearchBarProps } from './SearchBar';
import { MoonIcon, PlusIcon, SlidersIcon, SunIcon } from './icons';
import styles from './TopBar.module.css';

interface TopBarProps {
  theme: Theme;
  onToggleTheme: () => void;
  onAddClick: () => void;
  onManageClick: () => void;
  search: SearchBarProps;
}

export function TopBar({ theme, onToggleTheme, onAddClick, onManageClick, search }: TopBarProps) {
  return (
    <header className={styles.topbar}>
      <div className={styles.inner}>
        <a className={styles.brand} href="./" aria-label="NavPage 首页">
          <span className={styles.mark}>N</span>
          <span className={styles.text}>
            <strong>NavPage</strong>
            <small>干净地开始每一次上网</small>
          </span>
        </a>

        <SearchBar {...search} />

        <div className={styles.actions}>
          <button className="icon-btn" type="button" onClick={onAddClick} title="添加网站">
            <PlusIcon />
            <span className={styles.label}>添加</span>
          </button>
          <button className="icon-btn" type="button" onClick={onManageClick} title="管理分类 / 引擎 / 外观">
            <SlidersIcon />
            <span className={styles.label}>管理</span>
          </button>
          <button
            className="icon-btn icon-btn--square"
            type="button"
            onClick={onToggleTheme}
            title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
            aria-label="切换主题"
          >
            {theme === 'dark' ? <MoonIcon /> : <SunIcon />}
          </button>
        </div>
      </div>
    </header>
  );
}
