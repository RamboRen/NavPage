/** 统一的 fetch 封装：JSON 编解码、错误消息、401 统一处理 */

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export const isUnauthorized = (error: unknown) =>
  error instanceof ApiError && error.status === 401;

let unauthorizedHandler: (() => void) | null = null;

/** 任何请求收到 401 时回调（会话过期 → 回到登录页） */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(path, {
      // 会话存在 HttpOnly Cookie 里，同源请求要带上
      credentials: 'same-origin',
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers || {})
      }
    });
  } catch {
    throw new ApiError('无法连接服务，请确认后端已启动', 0);
  }

  if (!response.ok) {
    let message = `请求失败（${response.status}）`;
    let code: string | undefined;
    try {
      const data = (await response.json()) as { error?: string; code?: string };
      if (data?.error) message = data.error;
      code = data?.code;
    } catch {
      /* 响应不是 JSON，使用默认文案 */
    }

    if (response.status === 401 && code === 'UNAUTHORIZED') {
      unauthorizedHandler?.();
    }
    throw new ApiError(message, response.status, code);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** 便捷请求体构造 */
export const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) })
});
