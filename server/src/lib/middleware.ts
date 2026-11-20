import type { Context, MiddlewareHandler } from 'hono';
import { verifyAccessToken } from '../auth/jwt';
import type { AppEnv } from '../types';
import { HttpError, unauthorized } from './http';

/** Fixed-window rate limit backed by the Db. Throws 429 with Retry-After. */
export async function rateLimit(c: Context<AppEnv>, key: string, max: number, windowMs: number): Promise<void> {
  const deps = c.get('deps');
  const now = deps.now();
  const db = await deps.db();
  const n = await db.hit(`rl:${key}`, windowMs, now);
  if (n > max) {
    const retry = Math.max(1, Math.ceil(((Math.floor(now / windowMs) + 1) * windowMs - now) / 1000));
    throw new HttpError(429, 'rate_limited', undefined, { 'retry-after': String(retry) });
  }
}

export function bearer(c: Context): string | null {
  const h = c.req.header('authorization');
  if (!h) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  return m ? m[1]! : null;
}

/**
 * Requires a valid access token for a user that still exists. Tokens issued before an account was
 * deleted are rejected because the user lookup fails. `allowMissingUser` is only for DELETE /account
 * (idempotent deletion).
 */
export function requireUser(opts: { allowMissingUser?: boolean } = {}): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = bearer(c);
    if (!token) throw unauthorized();
    const deps = c.get('deps');
    const claims = await verifyAccessToken(deps.config, token, deps.now());
    if (!claims) throw unauthorized();
    const db = await deps.db();
    const user = await db.getUser(claims.sub);
    if (!user && !opts.allowMissingUser) throw unauthorized();
    c.set('userId', claims.sub);
    c.set('user', user);
    await next();
  };
}

export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  c.header('Cross-Origin-Resource-Policy', 'same-origin');
  if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store');
};
