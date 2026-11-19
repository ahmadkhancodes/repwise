import { SignJWT, jwtVerify } from 'jose';
import type { Config } from '../config';
import { HttpError } from '../lib/http';

export interface AccessClaims {
  sub: string;
  iat: number;
  anon: boolean;
}

function key(cfg: Config): Uint8Array {
  // Fail closed: a short or missing secret is a deployment error, never a silent weak key.
  if (cfg.jwt.secret.length < 32) throw new HttpError(503, 'not_configured');
  return new TextEncoder().encode(cfg.jwt.secret);
}

export async function signAccessToken(cfg: Config, userId: string, anon: boolean, nowMs: number): Promise<string> {
  const iat = Math.floor(nowMs / 1000);
  return new SignJWT({ anon, typ: 'access' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuer(cfg.jwt.issuer)
    .setAudience(cfg.jwt.audience)
    .setIssuedAt(iat)
    .setExpirationTime(iat + cfg.jwt.accessTtlSec)
    .sign(key(cfg));
}

/** Returns null for anything that is not a valid, unexpired access token of ours. Never throws on bad input. */
export async function verifyAccessToken(cfg: Config, token: string, nowMs: number): Promise<AccessClaims | null> {
  const k = key(cfg);
  if (token.length > 4096) return null;
  try {
    const { payload } = await jwtVerify(token, k, {
      algorithms: ['HS256'],
      issuer: cfg.jwt.issuer,
      audience: cfg.jwt.audience,
      currentDate: new Date(nowMs),
      requiredClaims: ['sub', 'iat', 'exp'],
    });
    if (payload.typ !== 'access' || typeof payload.sub !== 'string' || typeof payload.iat !== 'number') return null;
    return { sub: payload.sub, iat: payload.iat, anon: payload.anon === true };
  } catch {
    return null;
  }
}
