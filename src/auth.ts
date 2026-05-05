import type { HttpClient } from './http';
import type { TokenStorage } from './storage';
import type {
  LoginRequest,
  LoginResponse,
  OtpVerifyRequest,
  PasskeyAuthStartResponse,
  PasskeyCredential,
  PasskeyRegisterStartResponse,
  RegisterRequest,
  SsoProvider,
  TokenPair,
} from './types';

export class AuthModule {
  constructor(
    private readonly http: HttpClient,
    private readonly storage: TokenStorage,
    private readonly serviceId: string,
  ) {}

  private get base() {
    return `/v1/${this.serviceId}/auth`;
  }

  // ── Password auth ─────────────────────────────────────────────────

  async register(req: RegisterRequest): Promise<{ message: string }> {
    return this.http.post(`${this.base}/register`, req, { auth: false });
  }

  async login(req: LoginRequest): Promise<LoginResponse> {
    const resp = await this.http.post<LoginResponse>(`${this.base}/login`, req, { auth: false });
    if (resp.access_token && resp.refresh_token) {
      await this.storage.setTokens({
        access_token: resp.access_token,
        refresh_token: resp.refresh_token,
        expires_in: resp.expires_in ?? 900,
      });
    }
    return resp;
  }

  async completeMfaLogin(mfaToken: string, code: string): Promise<TokenPair> {
    const pair = await this.http.post<TokenPair>(
      `${this.base}/login/mfa`,
      { mfa_token: mfaToken, code },
      { auth: false },
    );
    await this.storage.setTokens(pair);
    return pair;
  }

  async refresh(): Promise<boolean> {
    const refreshToken = await this.storage.getRefreshToken();
    if (!refreshToken) return false;
    try {
      const pair = await this.http.post<TokenPair>(
        `${this.base}/refresh`,
        { refresh_token: refreshToken },
        { auth: false, skipRefresh: true },
      );
      await this.storage.setTokens(pair);
      return true;
    } catch {
      await this.storage.clearTokens();
      return false;
    }
  }

  async logout(): Promise<void> {
    try {
      await this.http.post(`${this.base}/logout`, undefined, { auth: true });
    } finally {
      await this.storage.clearTokens();
    }
  }

  async requestPasswordReset(email: string): Promise<{ message: string }> {
    return this.http.post(`${this.base}/password-reset/request`, { email }, { auth: false });
  }

  // ── MFA ──────────────────────────────────────────────────────────

  async setupMfa(): Promise<{ secret: string; otpauth_uri: string; backup_codes: string[] }> {
    return this.http.post(`${this.base}/mfa/setup`, undefined, { auth: true });
  }

  async verifyMfa(code: string): Promise<void> {
    return this.http.post(`${this.base}/mfa/verify`, { code }, { auth: true });
  }

  // ── Passwordless ─────────────────────────────────────────────────

  async requestMagicLink(email: string): Promise<{ message: string }> {
    return this.http.post(`${this.base}/magic-link`, { email }, { auth: false });
  }

  async verifyMagicLink(token: string): Promise<TokenPair> {
    const pair = await this.http.post<TokenPair>(
      `${this.base}/magic-link/verify`,
      { token },
      { auth: false },
    );
    await this.storage.setTokens(pair);
    return pair;
  }

  async requestOtp(email: string): Promise<{ message: string }> {
    return this.http.post(`${this.base}/otp`, { email }, { auth: false });
  }

  async verifyOtp(req: OtpVerifyRequest): Promise<TokenPair> {
    const pair = await this.http.post<TokenPair>(`${this.base}/otp/verify`, req, { auth: false });
    await this.storage.setTokens(pair);
    return pair;
  }

  // ── Passkeys ─────────────────────────────────────────────────────

  async passkeyRegisterStart(): Promise<PasskeyRegisterStartResponse> {
    return this.http.post(`${this.base}/passkey/register/start`, undefined, { auth: true });
  }

  async passkeyRegisterFinish(credential: unknown): Promise<void> {
    return this.http.post(`${this.base}/passkey/register/finish`, credential, { auth: true });
  }

  async passkeyAuthStart(email: string): Promise<PasskeyAuthStartResponse> {
    return this.http.post(`${this.base}/passkey/auth/start`, { email }, { auth: false });
  }

  async passkeyAuthFinish(credential: unknown): Promise<TokenPair> {
    const pair = await this.http.post<TokenPair>(
      `${this.base}/passkey/auth/finish`,
      credential,
      { auth: false },
    );
    await this.storage.setTokens(pair);
    return pair;
  }

  async listPasskeys(): Promise<PasskeyCredential[]> {
    return this.http.get(`${this.base}/passkey`, { auth: true });
  }

  async deletePasskey(credId: string): Promise<void> {
    return this.http.delete(`${this.base}/passkey/${credId}`, { auth: true });
  }

  // ── SSO ──────────────────────────────────────────────────────────

  async listSsoProviders(): Promise<SsoProvider[]> {
    return this.http.get(`${this.base}/sso`, { auth: false });
  }

  ssoInitiateUrl(providerId: string): string {
    return `${this.http.baseUrl}${this.base}/sso/${providerId}/initiate`;
  }

  async handleSsoCallback(
    providerId: string,
    params: { state: string; code: string },
  ): Promise<TokenPair> {
    const pair = await this.http.get<TokenPair>(
      `${this.base}/sso/${providerId}/callback?state=${encodeURIComponent(params.state)}&code=${encodeURIComponent(params.code)}`,
      { auth: false },
    );
    await this.storage.setTokens(pair);
    return pair;
  }

  // ── Helpers ───────────────────────────────────────────────────────

  async getAccessToken(): Promise<string | null> {
    return this.storage.getAccessToken();
  }

  async isAuthenticated(): Promise<boolean> {
    const token = await this.storage.getAccessToken();
    return token !== null;
  }

  // ── API Keys ──────────────────────────────────────────────────────

  async listApiKeys(): Promise<unknown[]> {
    return this.http.get(`/v1/${this.serviceId}/api-keys`);
  }

  async createApiKey(name: string, scopes: string[]): Promise<unknown> {
    return this.http.post(`/v1/${this.serviceId}/api-keys`, { name, scopes });
  }

  async revokeApiKey(keyId: string): Promise<void> {
    await this.http.delete(`/v1/${this.serviceId}/api-keys/${keyId}`);
  }

  // ── Legal / Policies ──────────────────────────────────────────────

  async getPolicies(): Promise<unknown[]> {
    return this.http.get(`/v1/${this.serviceId}/policies`, { auth: false });
  }

  async recordConsent(policyId: string, version: string): Promise<void> {
    await this.http.post(`/v1/${this.serviceId}/consent`, { policy_id: policyId, version });
  }

  async getMissingConsents(): Promise<unknown[]> {
    return this.http.get(`/v1/${this.serviceId}/consent/missing`);
  }

  // ── Email Verification ──────────────────────────────────────────

  async verifyEmail(token: string): Promise<void> {
    await this.http.post(`${this.base}/verify-email`, { token }, { auth: false });
  }

  async confirmPasswordReset(token: string, newPassword: string): Promise<void> {
    await this.http.post(`${this.base}/password-reset/confirm`, { token, new_password: newPassword }, { auth: false });
  }

  // ── MFA Management ──────────────────────────────────────────────

  async getMfaStatus(): Promise<unknown> {
    return this.http.get(`${this.base}/mfa/status`);
  }

  async disableMfa(): Promise<void> {
    await this.http.delete(`${this.base}/mfa`);
  }

  async regenerateBackupCodes(): Promise<unknown> {
    return this.http.post(`${this.base}/mfa/backup-codes`, null);
  }

  // ── GDPR ────────────────────────────────────────────────────────

  async requestDataExport(): Promise<unknown> {
    return this.http.post(`/v1/${this.serviceId}/gdpr`, { type: 'export' });
  }

  async requestAccountDeletion(): Promise<unknown> {
    return this.http.post(`/v1/${this.serviceId}/gdpr`, { type: 'deletion' });
  }

  async getGdprRequests(): Promise<unknown[]> {
    return this.http.get(`/v1/${this.serviceId}/gdpr`);
  }
}
