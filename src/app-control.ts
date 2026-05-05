import type { HttpClient } from './http';
import type { VersionCheckResponse } from './types';

export class AppControlModule {
  constructor(
    private readonly http: HttpClient,
    private readonly serviceId: string,
  ) {}

  private get base() {
    return `/v1/${this.serviceId}/appcontrol`;
  }

  /** Check if a version update is available for the given platform. */
  async checkVersion(platform: string, currentVersion: string): Promise<VersionCheckResponse> {
    return this.http.get(
      `${this.base}/version-check?platform=${encodeURIComponent(platform)}&current_version=${encodeURIComponent(currentVersion)}`,
      { auth: false },
    );
  }

  /** Check if the service is under maintenance. */
  async checkMaintenance(): Promise<Record<string, unknown>> {
    return this.http.get(`${this.base}/maintenance`, { auth: false });
  }

  /** Get remote configuration values. */
  async getRemoteConfig(): Promise<Record<string, unknown>> {
    return this.http.get(`${this.base}/config`, { auth: false });
  }

  /** Get active notices/announcements. */
  async getNotices(): Promise<Record<string, unknown>[]> {
    const resp = await this.http.get<{ notices: Record<string, unknown>[] }>(
      `${this.base}/notices`,
      { auth: false },
    );
    return resp.notices ?? [];
  }
}
