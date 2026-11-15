import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { authApi } from '../api/auth';
import { setUnauthorizedHandler } from '../api/client';
import type { AuthStatus, UserAccount } from '../types';

/**
 * 登录态仓库
 * ------------------------------------------------------------------
 * · 启动时 GET /api/auth/me 判断是否已登录
 * · 任何接口返回 401（会话过期）都会自动退回登录页
 * · 不开放注册：只有全新实例（hasUsers=false）能初始化第一个超级管理员
 * · 登录成功后由 App 挂载 NavProvider（key = user.id），数据随账号切换
 */
export interface AuthState {
  status: 'loading' | 'guest' | 'ready';
  user: UserAccount | null;
  hasUsers: boolean;
  /** 旧版数据迁移出的默认账号提示，改密后服务端不再返回 */
  defaultAccount: AuthStatus['defaultAccount'];
  /** 会话有效期（记住登录天数 / 未记住的小时数），用于登录页文案 */
  session: AuthStatus['session'] | null;
  /** 是否因为会话过期/被踢出而退回登录页 */
  expired: boolean;
}

interface AuthActions {
  /** remember=true 保持登录 30 天，false 仅本次浏览器会话有效 */
  login: (username: string, password: string, remember?: boolean) => Promise<void>;
  /** 全新实例初始化超级管理员（服务端仅在无账号时放行） */
  bootstrapAdmin: (username: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  updateProfile: (displayName: string) => Promise<void>;
  refreshStatus: () => Promise<void>;
}

interface AuthContextValue {
  state: AuthState;
  actions: AuthActions;
}

const INITIAL_STATE: AuthState = {
  status: 'loading',
  user: null,
  hasUsers: true,
  defaultAccount: null,
  session: null,
  expired: false
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(INITIAL_STATE);

  const refreshStatus = useCallback(async () => {
    const status = await authApi.status().catch(() => null);
    setState((current) => ({
      ...current,
      hasUsers: status?.hasUsers ?? current.hasUsers,
      defaultAccount: status?.defaultAccount ?? null,
      session: status?.session ?? current.session
    }));
  }, []);

  // 会话失效（401）时立刻退回登录页，并提示「登录状态已过期」
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setState((current) => {
        // 启动时 me 接口本来就会 401，这种情况不算「过期」
        if (!current.user) {
          return current.status === 'guest' ? current : { ...current, status: 'guest' };
        }
        return { ...current, status: 'guest', user: null, expired: true };
      });
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const { user } = await authApi.me();
        if (!alive) return;
        setState((current) => ({ ...current, status: 'ready', user }));
        void refreshStatus();
      } catch {
        if (!alive) return;
        setState((current) => ({ ...current, status: 'guest', user: null }));
        void refreshStatus();
      }
    })();

    return () => {
      alive = false;
    };
  }, [refreshStatus]);

  const login = useCallback(async (username: string, password: string, remember = true) => {
    const { user } = await authApi.login(username, password, remember);
    setState((current) => ({ ...current, status: 'ready', user, hasUsers: true, expired: false }));
  }, []);

  const bootstrapAdmin = useCallback(
    async (username: string, password: string, displayName?: string) => {
      const { user } = await authApi.bootstrapAdmin(username, password, displayName);
      setState((current) => ({ ...current, status: 'ready', user, hasUsers: true, expired: false }));
    },
    []
  );

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => undefined);
    setState((current) => ({ ...current, status: 'guest', user: null, expired: false }));
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      await authApi.changePassword(currentPassword, newPassword);
      // 改密后服务端不再返回迁移账号提示
      await refreshStatus();
    },
    [refreshStatus]
  );

  const updateProfile = useCallback(async (displayName: string) => {
    const { user } = await authApi.updateProfile(displayName);
    setState((current) => ({ ...current, user }));
  }, []);

  const actions = useMemo<AuthActions>(
    () => ({ login, bootstrapAdmin, logout, changePassword, updateProfile, refreshStatus }),
    [login, bootstrapAdmin, logout, changePassword, updateProfile, refreshStatus]
  );

  const value = useMemo(() => ({ state, actions }), [state, actions]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return context;
}
