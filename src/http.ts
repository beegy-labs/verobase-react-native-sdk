import type { TokenPair } from './types';
import type { TokenStorage } from './storage';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`HTTP ${status}`);
    this.name = 'ApiError';
  }
}

type RefreshFn = () => Promise<boolean>;

export class HttpClient {
  private refreshFn: RefreshFn | null = null;
  private refreshInFlight: Promise<boolean> | null = null;

  constructor(
    readonly baseUrl: string,
    private readonly storage: TokenStorage,
  ) {}

  setRefreshFn(fn: RefreshFn) {
    this.refreshFn = fn;
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    opts: { auth?: boolean; skipRefresh?: boolean } = {},
  ): Promise<T> {
    const { auth = true, skipRefresh = false } = opts;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (auth) {
      const token = await this.storage.getAccessToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    // Auto-refresh on 401
    if (res.status === 401 && auth && !skipRefresh && this.refreshFn) {
      if (!this.refreshInFlight) {
        this.refreshInFlight = this.refreshFn().finally(() => {
          this.refreshInFlight = null;
        });
      }
      const refreshed = await this.refreshInFlight;
      if (refreshed) {
        return this.request<T>(method, path, body, { auth, skipRefresh: true });
      }
    }

    if (!res.ok) {
      let errorBody: unknown;
      try {
        errorBody = await res.json();
      } catch {
        errorBody = await res.text();
      }
      throw new ApiError(res.status, errorBody);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  get<T>(path: string, opts?: { auth?: boolean }) {
    return this.request<T>('GET', path, undefined, opts);
  }

  post<T>(path: string, body?: unknown, opts?: { auth?: boolean; skipRefresh?: boolean }) {
    return this.request<T>('POST', path, body, opts);
  }

  patch<T>(path: string, body?: unknown, opts?: { auth?: boolean }) {
    return this.request<T>('PATCH', path, body, opts);
  }

  delete<T>(path: string, opts?: { auth?: boolean }) {
    return this.request<T>('DELETE', path, undefined, opts);
  }
}
