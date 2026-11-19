import type { Db, RefreshTokenDoc, UserDoc } from '../db/types';
import { DuplicateKeyError } from '../db/types';
import { b64url, hmacSha256Hex, randomBytes, sha256Hex, uuidv7 } from '../lib/crypto';
import type { Deps } from '../types';
import { signAccessToken } from './jwt';

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: { id: string; email: string | null; anonymous: boolean };
}

export function publicUser(u: UserDoc) {
  return { id: u._id, email: u.email ?? null, anonymous: u.anonymous };
}

/**
 * The refresh token that replaces `token` on rotation. Deterministic (HMAC with the server secret),
 * so a client retrying a refresh whose response was lost receives the same successor.
 */
export async function successorRefreshToken(secret: string, token: string): Promise<string> {
  return `rt_${await hmacSha256Hex(secret || 'unset', `refresh-successor:${token}`)}`;
}

/** Issue a 15-minute access JWT and an opaque refresh token (stored as sha256 only). */
export async function issueTokens(
  deps: Deps,
  db: Db,
  user: UserDoc,
  opts: { deviceId?: string | undefined; familyId?: string | undefined; refreshToken?: string | undefined } = {},
): Promise<TokenResponse> {
  const now = deps.now();
  const refreshToken = opts.refreshToken ?? `rt_${b64url(randomBytes(32))}`;
  const doc: RefreshTokenDoc = {
    _id: uuidv7(now),
    userId: user._id,
    tokenHash: await sha256Hex(refreshToken),
    familyId: opts.familyId ?? uuidv7(now),
    createdAt: now,
    expiresAt: now + deps.config.jwt.refreshTtlMs,
    rotatedAt: null,
  };
  if (opts.deviceId) doc.deviceId = opts.deviceId;
  try {
    await db.insertRefreshToken(doc);
  } catch (e) {
    // A grace-window retry of the same rotation: the successor is already stored (unused).
    if (!(e instanceof DuplicateKeyError) || !opts.refreshToken) throw e;
  }
  return {
    accessToken: await signAccessToken(deps.config, user._id, user.anonymous, now),
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: deps.config.jwt.accessTtlSec,
    user: publicUser(user),
  };
}
