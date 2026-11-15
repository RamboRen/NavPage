/** 账号相关接口 */
import type { AdminUserRecord, AuthStatus, UserAccount, UserInput, UserRole } from '../types';
import { json, request } from './client';

export const authApi = {
  /** 是否已有账号 / 迁移账号提示（公开接口） */
  status: () => request<AuthStatus>('/api/auth/status'),

  me: () => request<{ user: UserAccount }>('/api/auth/me'),

  /** remember=true 时服务端下发 30 天持久 Cookie，否则只用浏览器会话 */
  login: (username: string, password: string, remember = true) =>
    request<{ user: UserAccount; remember: boolean }>(
      '/api/auth/login',
      json('POST', { username, password, remember })
    ),

  /** 仅全新实例可用：创建第一个超级管理员，之后服务端会拒绝 */
  bootstrapAdmin: (username: string, password: string, displayName?: string) =>
    request<{ user: UserAccount; isFirstUser: boolean }>(
      '/api/auth/register',
      json('POST', { username, password, displayName })
    ),

  logout: () => request<void>('/api/auth/logout', json('POST')),

  updateProfile: (displayName: string) =>
    request<{ user: UserAccount }>('/api/auth/profile', json('PATCH', { displayName })),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>('/api/auth/password', json('PATCH', { currentPassword, newPassword })),

  /* ---- 账号管理（仅超级管理员） ---- */

  listUsers: () => request<{ users: AdminUserRecord[] }>('/api/users'),

  createUser: (input: UserInput) =>
    request<{ user: UserAccount }>('/api/users', json('POST', input)),

  updateUser: (
    id: number,
    patch: { displayName?: string; password?: string; role?: UserRole }
  ) => request<{ user: UserAccount }>(`/api/users/${id}`, json('PATCH', patch)),

  deleteUser: (id: number) => request<void>(`/api/users/${id}`, json('DELETE'))
};
