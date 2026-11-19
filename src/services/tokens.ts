import * as SecureStore from 'expo-secure-store';

/**
 * Token storage (sheet 15): access JWT + rotating refresh token in expo-secure-store (Keychain /
 * Android Keystore), cached in memory. Never in MMKV, logs or analytics.
 */
export type ApiUser = { id: string; email: string | null; anonymous: boolean };

export type StoredSession = {
  accessToken: string;
  refreshToken: string;
  /** ms epoch when the access token expires (from the server's expiresIn). */
  accessExpiresAt: number;
  user: ApiUser;
};

/** Worker token response (server/src/auth/session.ts TokenResponse). */
export type TokenResponse = {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: ApiUser;
};

const KEY = 'repwise.session.v1';
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

let cache: StoredSession | null | undefined; // undefined = not loaded yet
let loading: Promise<StoredSession | null> | null = null;

function isSession(v: unknown): v is StoredSession {
  const s = v as StoredSession;
  return (
    typeof s === 'object' &&
    s !== null &&
    typeof s.accessToken === 'string' &&
    typeof s.refreshToken === 'string' &&
    typeof s.accessExpiresAt === 'number' &&
    typeof s.user?.id === 'string'
  );
}

export function sessionFromResponse(r: TokenResponse, now: number): StoredSession {
  return {
    accessToken: r.accessToken,
    refreshToken: r.refreshToken,
    accessExpiresAt: now + Math.max(0, r.expiresIn) * 1000,
    user: { id: r.user.id, email: r.user.email ?? null, anonymous: r.user.anonymous },
  };
}

/** Load once from secure storage; later calls return the cached value. */
export function loadSession(): Promise<StoredSession | null> {
  if (cache !== undefined) return Promise.resolve(cache);
  if (!loading) {
    loading = SecureStore.getItemAsync(KEY, OPTIONS)
      .then((raw) => {
        let parsed: unknown = null;
        try {
          parsed = raw ? JSON.parse(raw) : null;
        } catch {
          parsed = null;
        }
        // A save/clear that happened while we were reading wins.
        if (cache === undefined) cache = isSession(parsed) ? parsed : null;
        return cache;
      })
      .catch(() => {
        if (cache === undefined) cache = null;
        return cache;
      })
      .finally(() => {
        loading = null;
      });
  }
  return loading;
}

/** Cached session without waiting (null if not loaded yet or signed out). */
export function peekSession(): StoredSession | null {
  return cache ?? null;
}

export async function saveSession(s: StoredSession): Promise<void> {
  cache = s;
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(s), OPTIONS);
  } catch {
    // Keep the in-memory session; the user signs in again after a restart at worst.
  }
}

export async function clearSession(): Promise<void> {
  cache = null;
  try {
    await SecureStore.deleteItemAsync(KEY, OPTIONS);
  } catch {
    // nothing stored
  }
}

/** Tests only. */
export function resetTokensForTests(): void {
  cache = undefined;
  loading = null;
}
