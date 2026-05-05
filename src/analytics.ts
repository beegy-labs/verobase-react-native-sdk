import { Platform } from 'react-native';
import type { HttpClient } from './http';
import type { TokenStorage } from './storage';
import type { GroupOptions } from './types';

export type BreadcrumbLevel = 'debug' | 'info' | 'warning' | 'error';

export interface Breadcrumb {
  category: string;
  message: string;
  level?: BreadcrumbLevel;
  timestamp?: string;
  data?: Record<string, unknown>;
}

const DEFAULT_BREADCRUMB_LIMIT = 50;

export class AnalyticsModule {
  private breadcrumbs: Breadcrumb[] = [];
  private breadcrumbLimit = DEFAULT_BREADCRUMB_LIMIT;

  constructor(
    private readonly http: HttpClient,
    private readonly serviceId: string,
    private readonly storage: TokenStorage,
  ) {}

  setBreadcrumbLimit(limit: number): void {
    this.breadcrumbLimit = Math.max(0, limit);
    if (this.breadcrumbs.length > this.breadcrumbLimit) {
      this.breadcrumbs = this.breadcrumbs.slice(-this.breadcrumbLimit);
    }
  }

  addBreadcrumb(crumb: Breadcrumb): void {
    if (this.breadcrumbLimit === 0) return;
    const stamped: Breadcrumb = {
      ...crumb,
      level: crumb.level ?? 'info',
      timestamp: crumb.timestamp ?? new Date().toISOString(),
    };
    this.breadcrumbs.push(stamped);
    if (this.breadcrumbs.length > this.breadcrumbLimit) {
      this.breadcrumbs.shift();
    }
  }

  getBreadcrumbs(): Breadcrumb[] {
    return this.breadcrumbs.slice();
  }

  clearBreadcrumbs(): void {
    this.breadcrumbs = [];
  }

  private get base() {
    return `/v1/${this.serviceId}/analytics`;
  }

  /** Track a custom event. Fire-and-forget — errors are silently ignored. */
  track(
    name: string,
    props?: Record<string, unknown>,
    options?: { revenue?: number; currency?: string },
  ): void {
    this.http
      .post(
        `${this.base}/track`,
        {
          name,
          props,
          platform: Platform.OS,
          anonymous_id: this.storage.getAnonymousId(),
          ...(options?.revenue !== undefined && { revenue: options.revenue }),
          ...(options?.currency !== undefined && { currency: options.currency }),
        },
        { auth: false },
      )
      .catch(() => {});
  }

  /** Track a screen view. Fire-and-forget. */
  screenview(screenName: string, props?: Record<string, unknown>): void {
    this.http
      .post(
        `${this.base}/screenview`,
        {
          screen_name: screenName,
          props,
          platform: Platform.OS,
          anonymous_id: this.storage.getAnonymousId(),
        },
        { auth: false },
      )
      .catch(() => {});
  }

  /** Set user properties. Fire-and-forget. */
  setUserProperties(props: Record<string, unknown>): void {
    this.http
      .post(
        `${this.base}/identify`,
        { ...props, platform: Platform.OS, anonymous_id: this.storage.getAnonymousId() },
        { auth: false },
      )
      .catch(() => {});
  }

  /** Assign the current user to a group. Fire-and-forget. */
  group(options: GroupOptions): void {
    this.http
      .post(
        `${this.base}/group`,
        {
          group_id: options.groupId,
          group_type: options.groupType,
          properties: options.properties,
          platform: Platform.OS,
          anonymous_id: this.storage.getAnonymousId(),
        },
        { auth: false },
      )
      .catch(() => {});
  }

  /**
   * Capture an exception as event '$error'. Fire-and-forget.
   * Pair with `setupErrorCapture()` for global handler.
   */
  trackError(
    error: Error | { name?: string; message?: string; stack?: string },
    context?: Record<string, unknown>,
  ): void {
    this.track(
      '$error',
      {
        name: error?.name ?? 'Error',
        message: String(error?.message ?? ''),
        stack: typeof error?.stack === 'string' ? error.stack : undefined,
        platform: Platform.OS,
        breadcrumbs: this.breadcrumbs.slice(),
        ...context,
      },
    );
  }

  /**
   * Auto-instrument fetch + console.warn/error so navigation, network, and
   * log noise become breadcrumbs attached to subsequent trackError calls.
   * Safe to call on app boot — idempotent. RN-only patches happen here.
   */
  installAutoBreadcrumbs(opts?: { fetch?: boolean; console?: boolean }): void {
    const wantFetch   = opts?.fetch   ?? true;
    const wantConsole = opts?.console ?? true;
    const g = globalThis as {
      fetch?: typeof fetch;
      console: Console;
      __veroFetchPatched?: boolean;
      __veroConsolePatched?: boolean;
    };
    if (wantFetch && g.fetch && !g.__veroFetchPatched) {
      const original = g.fetch;
      g.fetch = (async (...args: Parameters<typeof fetch>) => {
        const [input, init] = args;
        const method = (init?.method ?? 'GET').toUpperCase();
        const url = typeof input === 'string' ? input : (input as Request).url;
        try {
          const res = await original(...args);
          this.addBreadcrumb({
            category: 'http',
            message: `${method} ${url} → ${res.status}`,
            level: res.ok ? 'info' : 'warning',
            data: { status: res.status },
          });
          return res;
        } catch (err) {
          this.addBreadcrumb({
            category: 'http',
            message: `${method} ${url} failed`,
            level: 'error',
            data: { error: String(err) },
          });
          throw err;
        }
      }) as typeof fetch;
      g.__veroFetchPatched = true;
    }
    if (wantConsole && !g.__veroConsolePatched) {
      const wrap = (level: BreadcrumbLevel, original: (...a: unknown[]) => void) => {
        return (...args: unknown[]) => {
          try {
            this.addBreadcrumb({
              category: 'console',
              message: args.map((a) => (typeof a === 'string' ? a : safeStringify(a))).join(' ').slice(0, 500),
              level,
            });
          } catch { /* never block logging */ }
          original(...args);
        };
      };
      g.console.warn  = wrap('warning', g.console.warn.bind(g.console));
      g.console.error = wrap('error',   g.console.error.bind(g.console));
      g.__veroConsolePatched = true;
    }
  }

  /**
   * Wire global error handlers (RN ErrorUtils + unhandled promise rejection).
   * Idempotent — calling twice replaces the previous hook.
   */
  setupErrorCapture(): void {
    const ErrorUtils = (globalThis as { ErrorUtils?: { getGlobalHandler: () => (e: Error, isFatal?: boolean) => void; setGlobalHandler: (h: (e: Error, isFatal?: boolean) => void) => void } }).ErrorUtils;
    if (ErrorUtils && !(this as unknown as { __errCaptureInstalled?: boolean }).__errCaptureInstalled) {
      const prev = ErrorUtils.getGlobalHandler();
      ErrorUtils.setGlobalHandler((err, isFatal) => {
        this.trackError(err, { fatal: !!isFatal });
        prev?.(err, isFatal);
      });
      (this as unknown as { __errCaptureInstalled?: boolean }).__errCaptureInstalled = true;
    }
  }

  /** Send session replay events. Fire-and-forget. */
  sendReplayEvents(sessionId: string, events: unknown[]): void {
    this.http
      .post(
        `${this.base}/replay`,
        { session_id: sessionId, events, platform: Platform.OS },
        { auth: false },
      )
      .catch(() => {});
  }
}

function safeStringify(v: unknown): string {
  try { return JSON.stringify(v); } catch { return String(v); }
}
