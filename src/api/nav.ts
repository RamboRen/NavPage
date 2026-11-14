/** 导航数据接口封装 */
import type {
  Appearance,
  BootstrapPayload,
  CategoryInput,
  CategoryRecord,
  EngineInput,
  Preferences,
  SearchEngine,
  SiteInput,
  SiteRecord
} from '../types';
import { json, request } from './client';

export const api = {
  bootstrap: () => request<BootstrapPayload>('/api/bootstrap'),

  /* ---- 收藏 ---- */
  savePins: (pins: string[]) => request<{ pins: string[] }>('/api/pins', json('PUT', { pins })),

  /* ---- 站点 ---- */
  createSite: (input: SiteInput) => request<{ site: SiteRecord }>('/api/sites', json('POST', input)),
  updateSite: (id: number, input: SiteInput) =>
    request<{ site: SiteRecord }>(`/api/sites/${id}`, json('PATCH', input)),
  deleteSite: (id: number) => request<void>(`/api/sites/${id}`, json('DELETE')),

  /* ---- 分类 ---- */
  createCategory: (input: CategoryInput) =>
    request<{ category: CategoryRecord }>('/api/categories', json('POST', input)),
  updateCategory: (id: string, input: Partial<CategoryInput>) =>
    request<{ category: CategoryRecord }>(`/api/categories/${id}`, json('PATCH', input)),
  deleteCategory: (id: string, options: { moveTo?: string; force?: boolean } = {}) =>
    request<{ categories: CategoryRecord[]; sites: SiteRecord[]; pins: string[] }>(
      `/api/categories/${id}`,
      json('DELETE', options)
    ),
  reorderCategories: (ids: string[]) =>
    request<{ categories: CategoryRecord[] }>('/api/categories/order', json('PUT', { ids })),

  /* ---- 搜索引擎 ---- */
  createEngine: (input: EngineInput) => request<{ engine: SearchEngine }>('/api/engines', json('POST', input)),
  updateEngine: (id: string, input: Partial<EngineInput>) =>
    request<{ engine: SearchEngine }>(`/api/engines/${id}`, json('PATCH', input)),
  deleteEngine: (id: string) =>
    request<{ engines: SearchEngine[]; preferences: Preferences }>(`/api/engines/${id}`, json('DELETE')),

  /* ---- 偏好 ---- */
  savePreferences: (patch: Partial<Preferences> | Appearance) =>
    request<{ preferences: Preferences }>('/api/preferences', json('PUT', patch)),

  /* ---- 维护 ---- */
  reset: () =>
    request<Omit<BootstrapPayload, 'sites'> & { sites: SiteRecord[]; hotUrls: string[] }>(
      '/api/reset',
      json('POST')
    )
};
