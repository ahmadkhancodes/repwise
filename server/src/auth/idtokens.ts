import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { safeEqual, sha256Hex } from '../lib/crypto';
import { HttpError } from '../lib/http';

export interface Identity {
  sub: string;
  email?: string;
  emailVerified: boolean;
}

export type IdTokenVerifier = (token: string, opts?: { nonce?: string }) => Promise<Identity>;

export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
export const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';

const invalid = () => new HttpError(401, 'invalid_token');

function email(payload: Record<string, unknown>): Pick<Identity, 'email' | 'emailVerified'> {
  const e = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : undefined;
  const verified = payload.email_verified === true || payload.email_verified === 'true';
  return e ? { email: e, emailVerified: verified } : { emailVerified: false };
}

/** Google ID token (Sign in with Google / one-tap), verified against Google's JWKS. */
export function googleVerifier(audiences: string[], jwks: JWTVerifyGetKey = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL))): IdTokenVerifier {
  return async (token) => {
    if (audiences.length === 0) throw new HttpError(503, 'not_configured');
    try {
      const { payload } = await jwtVerify(token, jwks, {
        algorithms: ['RS256'],
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        audience: audiences,
        clockTolerance: 30,
      });
      if (typeof payload.sub !== 'string' || !payload.sub) throw invalid();
      return { sub: payload.sub, ...email(payload) };
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw invalid();
    }
  };
}

/**
 * Sign in with Apple identity token, verified against Apple's JWKS. The nonce is required and the
 * token must carry sha256-hex(raw nonce): the raw value never appears in the token, so a captured
 * token cannot be replayed by copying its own nonce claim.
 */
export function appleVerifier(audiences: string[], jwks: JWTVerifyGetKey = createRemoteJWKSet(new URL(APPLE_JWKS_URL))): IdTokenVerifier {
  return async (token, opts) => {
    if (audiences.length === 0) throw new HttpError(503, 'not_configured');
    try {
      const { payload } = await jwtVerify(token, jwks, {
        algorithms: ['RS256', 'ES256'],
        issuer: 'https://appleid.apple.com',
        audience: audiences,
        clockTolerance: 30,
      });
      if (typeof payload.sub !== 'string' || !payload.sub) throw invalid();
      if (!opts?.nonce) throw invalid();
      const n = payload.nonce;
      if (typeof n !== 'string' || !safeEqual(n, await sha256Hex(opts.nonce))) throw invalid();
      return { sub: payload.sub, ...email(payload) };
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw invalid();
    }
  };
}
