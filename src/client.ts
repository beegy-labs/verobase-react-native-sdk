import { HttpClient } from './http';
import { TokenStorage } from './storage';
import { AuthModule } from './auth';
import { AnalyticsModule } from './analytics';
import { AppControlModule } from './app-control';
import type { VerobaseConfig } from './types';

export class VerobaseClient {
  readonly auth: AuthModule;
  readonly analytics: AnalyticsModule;
  readonly appControl: AppControlModule;

  private readonly http: HttpClient;

  constructor(config: VerobaseConfig) {
    const storage = new TokenStorage();
    this.http = new HttpClient(config.baseUrl, storage);

    this.auth = new AuthModule(this.http, storage, config.serviceId);
    this.analytics = new AnalyticsModule(this.http, config.serviceId, storage);
    this.appControl = new AppControlModule(this.http, config.serviceId);

    this.http.setRefreshFn(() => this.auth.refresh());
  }
}

// ── Singleton factory ─────────────────────────────────────────────

let _instance: VerobaseClient | null = null;

/**
 * Initialise the global Verobase client. Call once at app startup.
 *
 * @example
 * import { init, verobase } from "@verobase/react-native-sdk";
 *
 * init({ baseUrl: "https://api.example.com", serviceId: "..." });
 * await verobase.auth.login({ email, password });
 */
export function init(config: VerobaseConfig): VerobaseClient {
  _instance = new VerobaseClient(config);
  return _instance;
}

/**
 * The global Verobase client instance. Must call `init()` first.
 */
export const verobase: VerobaseClient = new Proxy({} as VerobaseClient, {
  get(_target, prop) {
    if (!_instance) {
      throw new Error('Verobase SDK not initialised — call init() before using verobase.');
    }
    return (_instance as unknown as Record<string | symbol, unknown>)[prop];
  },
});
