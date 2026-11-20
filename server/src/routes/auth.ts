import { Hono, type Context } from 'hono';
import type { Identity } from '../auth/idtokens';
import { verifyAccessToken } from '../auth/jwt';
import { issueTokens, successorRefreshToken } from '../auth/session';
import { recomputeEntitlement } from '../billing/entitlement';
import { DuplicateKeyError, type Db, type UserDoc } from '../db/types';
import { hmacSha256Hex, randomDigits, safeEqual, sha256Hex, uuidv7 } from '../lib/crypto';
import { HttpError, clientIp, unauthorized } from '../lib/http';
import { bearer, rateLimit } from '../lib/middleware';
import { parseJson } from '../lib/validate';
import { AnonymousBody, AppleBody, EmailStartBody, EmailVerifyBody, GoogleBody, RefreshBody } from '../schemas';
import type { AppEnv } from '../types';

const MIN = 60_000;
/** A rotated refresh token presented again within this window gets the same successor back. */
export const REFRESH_REUSE_GRACE_MS = 60_000;
export const EMAIL_CODE_MAX_ATTEMPTS = 5;

/** The anonymous account the caller is upgrading, if it sent a valid access token for one. */
async function currentAnonymous(c: Context<AppEnv>, db: Db): Promise<UserDoc | null> {
  const token = bearer(c);
  if (!token) return null;
  const deps = c.get('deps');
  const claims = await verifyAccessToken(deps.config, token, deps.now());
  if (!claims) return null;
  const u = await db.getUser(claims.sub);
  return u?.anonymous ? u : null;
}

type Provider = 'google' | 'apple' | 'email';
const SUB_FIELD = { google: 'googleSub', apple: 'appleSub' } as const;

/**
 * Find or create the account for a verified identity. If the caller holds an anonymous account it is
 * upgraded in place (new identity) or merged into the existing account (known identity), so
 * purchases made before sign-in follow the user (sheet 15).
 */
async function signIn(c: Context<AppEnv>, provider: Provider, id: Identity, device?: string) {
  const deps = c.get('deps');
  const db = await deps.db();
  const now = deps.now();
  const anon = await currentAnonymous(c, db);
  const subField = provider === 'email' ? null : SUB_FIELD[provider];

  let user = subField ? await db.findUserBy(subField, id.sub) : null;
  if (!user && id.email && id.emailVerified) user = await db.findUserBy('email', id.email);

  const patch: Partial<UserDoc> = { lastSeenAt: now, anonymous: false };
  if (subField) patch[subField] = id.sub;
  const country = c.req.header('cf-ipcountry');
  if (country && /^[A-Z]{2}$/.test(country)) patch.country = country;

  async function attachEmail(target: UserDoc) {
    if (!id.email || !id.emailVerified || target.email) return;
    const other = await db.findUserBy('email', id.email);
    if (!other) patch.email = id.email;
  }

  try {
    if (user) {
      await attachEmail(user);
      await db.updateUser(user._id, patch);
      if (anon && anon._id !== user._id) {
        await db.mergeAnonymousUser(anon._id, user._id);
        await recomputeEntitlement(deps, db, user._id);
      }
    } else if (anon) {
      await attachEmail(anon);
      await db.updateUser(anon._id, patch);
      user = anon;
    } else {
      const fresh: UserDoc = { _id: uuidv7(now), anonymous: false, createdAt: now, lastSeenAt: now };
      if (subField) fresh[subField] = id.sub;
      if (id.email && id.emailVerified && !(await db.findUserBy('email', id.email))) fresh.email = id.email;
      if (patch.country) fresh.country = patch.country;
      await db.createUser(fresh);
      user = fresh;
    }
  } catch (e) {
    if (e instanceof DuplicateKeyError) throw new HttpError(409, 'account_conflict');
    throw e;
  }
  const saved = (await db.getUser(user._id)) ?? user;
  return issueTokens(deps, db, saved, { deviceId: device });
}

export const authRoutes = new Hono<AppEnv>();

// Coarse per-IP limit on every auth route; finer limits below.
authRoutes.use('*', async (c, next) => {
  await rateLimit(c, `auth:ip:${clientIp(c)}`, 30, MIN);
  await next();
});

authRoutes.post('/anonymous', async (c) => {
  const body = await parseJson(c, AnonymousBody, 4 * 1024);
  await rateLimit(c, `auth:anon:${clientIp(c)}`, 10, 60 * MIN);
  const deps = c.get('deps');
  const db = await deps.db();
  const now = deps.now();
  const user: UserDoc = { _id: uuidv7(now), anonymous: true, createdAt: now, lastSeenAt: now };
  await db.createUser(user);
  return c.json(await issueTokens(deps, db, user, { deviceId: body.deviceId ?? undefined }), 201);
});

authRoutes.post('/google', async (c) => {
  const body = await parseJson(c, GoogleBody, 16 * 1024);
  const identity = await c.get('deps').verifyGoogle(body.idToken);
  return c.json(await signIn(c, 'google', identity, body.deviceId ?? undefined));
});

authRoutes.post('/apple', async (c) => {
  const body = await parseJson(c, AppleBody, 16 * 1024);
  // Required: the token's nonce claim must be sha256(raw nonce), binding it to this client's flow.
  const identity = await c.get('deps').verifyApple(body.identityToken, { nonce: body.nonce });
  return c.json(await signIn(c, 'apple', identity, body.deviceId ?? undefined));
});

authRoutes.post('/email/start', async (c) => {
  const { email } = await parseJson(c, EmailStartBody, 4 * 1024);
  await rateLimit(c, `auth:email-start:ip:${clientIp(c)}`, 10, 60 * MIN);
  await rateLimit(c, `auth:email-start:${await sha256Hex(email)}`, 3, 15 * MIN);
  const deps = c.get('deps');
  const db = await deps.db();
  const now = deps.now();
  const code = randomDigits(6);
  await db.putEmailCode({
    _id: uuidv7(now),
    email,
    codeHash: await hmacSha256Hex(deps.config.jwt.secret || 'unset', `${email}:${code}`),
    attempts: 0,
    createdAt: now,
    expiresAt: now + 10 * MIN,
  });
  await deps.mailer.send({
    to: email,
    subject: `${code} is your Repwise code`,
    text: `Your Repwise sign-in code is ${code}. It expires in 10 minutes. If you did not ask for it, ignore this email.`,
  });
  // Same response whether or not an account exists (no account enumeration).
  return c.json({ ok: true, expiresIn: 600 });
});

authRoutes.post('/email/verify', async (c) => {
  const body = await parseJson(c, EmailVerifyBody, 4 * 1024);
  const { email, code } = body;
  await rateLimit(c, `auth:email-verify:ip:${clientIp(c)}`, 20, 15 * MIN);
  // Per email as well, so guesses spread over many IPs still hit a wall (3 codes × 5 attempts).
  await rateLimit(c, `auth:email-verify:${await sha256Hex(email)}`, 3 * EMAIL_CODE_MAX_ATTEMPTS, 15 * MIN);
  const deps = c.get('deps');
  const db = await deps.db();
  const now = deps.now();
  // Count the attempt BEFORE comparing, atomically: parallel guesses cannot all see attempts = 0.
  const doc = await db.claimEmailCodeAttempt(email, now, EMAIL_CODE_MAX_ATTEMPTS);
  if (!doc) {
    if (await db.getEmailCode(email, now)) {
      await db.deleteEmailCodes(email); // used up: lock it
      throw new HttpError(429, 'too_many_attempts');
    }
    throw unauthorized('invalid_code');
  }
  const hash = await hmacSha256Hex(deps.config.jwt.secret || 'unset', `${email}:${code}`);
  if (!safeEqual(hash, doc.codeHash)) throw unauthorized('invalid_code');
  if (!(await db.consumeEmailCode(doc._id))) throw unauthorized('invalid_code'); // single use
  await db.deleteEmailCodes(email);
  return c.json(await signIn(c, 'email', { sub: email, email, emailVerified: true }, body.deviceId ?? undefined));
});

authRoutes.post('/refresh', async (c) => {
  const { refreshToken: token } = await parseJson(c, RefreshBody, 4 * 1024);
  const deps = c.get('deps');
  const db = await deps.db();
  const now = deps.now();
  const res = await db.consumeRefreshToken(await sha256Hex(token), now, REFRESH_REUSE_GRACE_MS);
  if (res.status === 'missing') throw unauthorized('invalid_refresh_token');
  // The successor is derived from the presented token, so a retry after a lost response gets the
  // very same refresh token back (idempotent rotation) instead of forking the family.
  const successor = await successorRefreshToken(deps.config.jwt.secret, token);
  if (res.status !== 'ok') {
    const next = await db.getRefreshToken(await sha256Hex(successor));
    // Reuse outside the grace window, or the successor was already used: assume theft.
    if (res.status === 'reused' || (next && next.rotatedAt)) {
      await db.revokeRefreshFamily(res.token.familyId);
      throw unauthorized('token_reused');
    }
  }
  const user = await db.getUser(res.token.userId);
  if (!user) throw unauthorized();
  await db.updateUser(user._id, { lastSeenAt: now });
  return c.json(
    await issueTokens(deps, db, user, { deviceId: res.token.deviceId, familyId: res.token.familyId, refreshToken: successor }),
  );
});

authRoutes.post('/logout', async (c) => {
  const { refreshToken: token } = await parseJson(c, RefreshBody, 4 * 1024);
  const deps = c.get('deps');
  const db = await deps.db();
  const res = await db.consumeRefreshToken(await sha256Hex(token), deps.now(), REFRESH_REUSE_GRACE_MS);
  if (res.status !== 'missing') await db.revokeRefreshFamily(res.token.familyId);
  return c.body(null, 204);
});
