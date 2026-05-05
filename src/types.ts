// ── Config ────────────────────────────────────────────────────────

export interface VerobaseConfig {
  baseUrl: string;
  serviceId: string;
}

// ── Auth types ────────────────────────────────────────────────────

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface LoginResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  mfa_required?: boolean;
  mfa_token?: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface OtpVerifyRequest {
  email: string;
  code: string;
}

export interface PasskeyRegisterStartResponse {
  challenge: string;
  user: { id: string; name: string; displayName: string };
  rp: { name: string; id: string };
  pubKeyCredParams: Array<{ type: string; alg: number }>;
  timeout: number;
  attestation: string;
}

export interface PasskeyAuthStartResponse {
  challenge: string;
  allowCredentials: Array<{ type: string; id: string }>;
  timeout: number;
  userVerification: string;
}

export interface PasskeyCredential {
  id: string;
  name: string | null;
  aaguid: string | null;
  created_at: string;
  last_used_at: string | null;
}

export interface SsoProvider {
  id: string;
  name: string;
  provider_type: 'oidc' | 'saml';
}

// ── App Control types ─────────────────────────────────────────────

export type UpdateType = 'FORCE' | 'RECOMMEND' | 'NONE';

export interface VersionCheckResponse {
  platform: string;
  current_version: string;
  latest_version: string;
  update_type: UpdateType;
  store_url: string | null;
  release_notes: string | null;
  message: { title: string; body: string };
}

// ── Analytics types ───────────────────────────────────────────────

export interface TrackEventPayload {
  name: string;
  props?: Record<string, unknown>;
  revenue?: number;
  currency?: string;
}

export interface GroupOptions {
  groupId: string;
  groupType: string;
  properties?: Record<string, unknown>;
}

export interface ReplayEvent {
  session_id: string;
  events: unknown[];
}
