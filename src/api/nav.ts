/** 后端接口封装：统一错误处理与 JSON 编解码 */
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

const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers || {})
      }
    });
  } catch {
    throw new Error('无法连接本地服务，请确认后端已启动');
  }

  if (!response.ok) {
    let message = `请求失败（${response.status}）`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      /* 响应不是 JSON，使用默认文案 */
    }
    throw new Error(message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) })
});

export const api = {
  bootstrap: () => request<BootstrapPayload>('/bootstrap'),

  /* ---- 收藏 ---- */
  savePins: (pins: string[]) => request<{ pins: string[] }>('/pins', json('PUT', { pins })),

  /* ---- 站点 ---- */
  createSite: (input: SiteInput) => request<{ site: SiteRecord }>('/sites', json('POST', input)),
  updateSite: (id: number, input: SiteInput) =>
    request<{ site: SiteRecord }>(`/sites/${id}`, json('PATCH', input)),
  deleteSite: (id: number) => request<void>(`/sites/${id}`, json('DELETE')),

  /* ---- 分类 ---- */
  createCategory: (input: CategoryInput) =>
    request<{ category: CategoryRecord }>('/categories', json('POST', input)),
  updateCategory: (id: string, input: Partial<CategoryInput>) =>
    request<{ category: CategoryRecord }>(`/categories/${id}`, json('PATCH', input)),
  deleteCategory: (id: string, options: { moveTo?: string; force?: boolean } = {}) =>
    request<{ categories: CategoryRecord[]; sites: SiteRecord[]; pins: string[] }>(
      `/categories/${id}`,
      json('DELETE', options)
    ),
  reorderCategories: (ids: string[]) =>
    request<{ categories: CategoryRecord[] }>('/categories/order', json('PUT', { ids })),

  /* ---- 搜索引擎 ---- */
  createEngine: (input: EngineInput) => request<{ engine: SearchEngine }>('/engines', json('POST', input)),
  updateEngine: (id: string, input: Partial<EngineInput>) =>
    request<{ engine: SearchEngine }>(`/engines/${id}`, json('PATCH', input)),
  deleteEngine: (id: string) =>
    request<{ engines: SearchEngine[]; preferences: Preferences }>(`/engines/${id}`, json('DELETE')),

  /* ---- 偏好 ---- */
  savePreferences: (patch: Partial<Preferences> | Appearance) =>
    request<{ preferences: Preferences }>('/preferences', json('PUT', patch)),

  /* ---- 维护 ---- */
  reset: () =>
    request<Omit<BootstrapPayload, 'sites'> & { sites: SiteRecord[]; hotUrls: string[] }>(
      '/reset',
      json('POST')
    )
};
