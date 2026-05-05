import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TokenPair } from './types';

const ACCESS_KEY    = 'verobase_access_token';
const REFRESH_KEY   = 'verobase_refresh_token';
const ANONYMOUS_KEY = 'verobase_anonymous_id';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export class TokenStorage {
  // Generated immediately so synchronous callers always have a value.
  // Replaced with the persisted value once AsyncStorage resolves.
  private _anonymousId: string = generateUUID();

  constructor() {
    // Load persisted anonymous ID in background; replace the in-memory one.
    AsyncStorage.getItem(ANONYMOUS_KEY).then((stored) => {
      if (stored) {
        this._anonymousId = stored;
      } else {
        AsyncStorage.setItem(ANONYMOUS_KEY, this._anonymousId).catch(() => {});
      }
    }).catch(() => {});
  }

  getAnonymousId(): string {
    return this._anonymousId;
  }

  async getAccessToken(): Promise<string | null> {
    return AsyncStorage.getItem(ACCESS_KEY);
  }

  async getRefreshToken(): Promise<string | null> {
    return AsyncStorage.getItem(REFRESH_KEY);
  }

  async setTokens(pair: TokenPair): Promise<void> {
    await AsyncStorage.multiSet([
      [ACCESS_KEY, pair.access_token],
      [REFRESH_KEY, pair.refresh_token],
    ]);
  }

  async clearTokens(): Promise<void> {
    await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY]);
  }
}
