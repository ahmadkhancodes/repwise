import type { Db, RefreshTokenDoc, UserDoc } from '../db/types';
import { b64url, randomBytes, sha256Hex, uuidv7 } from '../lib/crypto';
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

/** Issue a 15-minute access JWT and an opaque refresh token (stored as sha256 only). */
export async function issueTokens(
  deps: Deps,
  db: Db,
  user: UserDoc,
  opts: { deviceId?: string | undefined; familyId?: string | undefined } = {},
): Promise<TokenResponse> {
  const now = deps.now();
  const refreshToken = `rt_${b64url(randomBytes(32))}`;
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
  await db.insertRefreshToken(doc);
  return {
    accessToken: await signAccessToken(deps.config, user._id, user.anonymous, now),
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: deps.config.jwt.accessTtlSec,
    user: publicUser(user),
  };
}
