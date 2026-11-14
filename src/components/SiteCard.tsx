import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { SiteItem } from '../types';
import { brandColor, readableText } from '../utils/color';
import { hostOf, originOf } from '../utils/url';
import { PencilIcon } from './icons';
import styles from './SiteCard.module.css';

interface SiteCardProps {
  site: SiteItem;
  pinned: boolean;
  onTogglePin: (site: SiteItem) => void;
  onEdit: (site: SiteItem) => void;
}

export function SiteCard({ site, pinned, onTogglePin, onEdit }: SiteCardProps) {
  // favicon 候选：自定义图标 → 站点自带 → 第三方图标服务；全失败则退回首字母色块
  const candidates = useMemo(() => {
    if (site.icon) return [site.icon];
    const origin = originOf(site.url);
    const domain = hostOf(site.url);
    const list: string[] = [];
    if (origin) list.push(`${origin}/favicon.ico`);
    if (domain) list.push(`https://favicon.im/${domain}?larger=true`);
    return list;
  }, [site.icon, site.url]);

  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setIndex(0);
    setLoaded(false);
  }, [site.url]);

  const color = brandColor(site.name, site.color);
  const customStyle = {
    '--c': color,
    '--ct': readableText(color)
  } as CSSProperties;

  const src = candidates[index];

  return (
    <article className={styles.card} style={customStyle}>
      <a
        className={styles.hit}
        href={site.url}
        target="_blank"
        rel="noopener"
        aria-label={`打开 ${site.name}`}
      />

      <span className={styles.icon}>
        <span className={styles.letter} aria-hidden="true">
          {site.name.trim().charAt(0).toUpperCase()}
        </span>
        {src && (
          <img
            className={`${styles.img} ${loaded ? styles.imgLoaded : ''}`}
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onLoad={() => setLoaded(true)}
            onError={() => {
              setLoaded(false);
              setIndex((prev) => prev + 1);
            }}
          />
        )}
      </span>

      <div className={styles.body}>
        <span className={styles.name}>{site.name}</span>
        <span className={styles.desc}>{site.desc || hostOf(site.url)}</span>
      </div>

      <button
        type="button"
        className={`${styles.pin} ${pinned ? styles.pinOn : ''}`}
        onClick={() => onTogglePin(site)}
        title={pinned ? '取消收藏' : '收藏到「常用」'}
        aria-pressed={pinned}
      >
        {pinned ? '★' : '☆'}
      </button>

      <button
        type="button"
        className={styles.edit}
        onClick={() => onEdit(site)}
        title="编辑 / 删除这个站点"
        aria-label={`编辑 ${site.name}`}
      >
        <PencilIcon />
      </button>
    </article>
  );
}
