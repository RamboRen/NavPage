import type { SiteItem } from '../types';
import { hostOf } from './url';

/** 关键词命中：名称 / 描述 / 域名 / 分类名 */
export function matchesQuery(site: SiteItem, query: string): boolean {
  if (!query) return true;
  const haystack = [site.name, site.desc || '', hostOf(site.url), site.categoryName]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

export function filterSites(sites: SiteItem[], query: string): SiteItem[] {
  if (!query) return sites;
  return sites.filter((site) => matchesQuery(site, query));
}
