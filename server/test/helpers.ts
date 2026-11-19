import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from 'jose';
import type { LlmProvider } from '../src/ai/provider';
import { stubPlanner, type Planner } from '../src/ai/planner';
import { createApp } from '../src/app';
import { appleVerifier, googleVerifier } from '../src/auth/idtokens';
import { MemoryMailer } from '../src/auth/mailer';
import { createAppleStore, type AppleStore } from '../src/billing/apple';
import type { PlayApi, PlaySubscriptionV2 } from '../src/billing/play';
import { loadConfig } from '../src/config';
import { MemoryDb } from '../src/db/memory';
import type { Env } from '../src/env';
import type { Deps } from '../src/types';

export const GOOGLE_AUD = 'test-web-client.apps.googleusercontent.com';
export const T0 = Date.UTC(2026, 10, 19, 12, 0, 0);

export interface Issuer {
  sign(claims: Record<string, unknown>, opts?: { iss?: string; aud?: string; exp?: number; kid?: string }): Promise<string>;
  jwks: ReturnType<typeof createLocalJWKSet>;
}

export async function makeIssuer(defaultIss: string, defaultAud: string): Promise<Issuer> {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  return {
    jwks: createLocalJWKSet({ keys: [jwk] }),
    sign: (claims, opts = {}) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: opts.kid ?? 'k1' })
        .setIssuer(opts.iss ?? defaultIss)
        .setAudience(opts.aud ?? defaultAud)
        .setIssuedAt()
        .setExpirationTime(opts.exp ?? Math.floor(Date.now() / 1000) + 600)
        .sign(privateKey),
  };
}

export class FakePlay implements PlayApi {
  subs = new Map<string, PlaySubscriptionV2>();
  acked: string[] = [];
  async getSubscription(token: string) {
    return this.subs.get(token) ?? null;
  }
  async acknowledge(_sub: string, token: string) {
    this.acked.push(token);
  }
}

export interface TestCtx {
  app: ReturnType<typeof createApp>;
  deps: Deps;
  db: MemoryDb;
  mailer: MemoryMailer;
  clock: { now: number };
  google: Issuer;
  apple: Issuer;
  play: FakePlay;
  env: Env;
}

export async function setup(
  opts: {
    env?: Partial<Env>;
    appleStore?: AppleStore;
    planner?: Planner;
    llm?: LlmProvider | null;
    db?: MemoryDb;
    verifyPubsub?: Deps['verifyPubsub'];
  } = {},
): Promise<TestCtx> {
  const env: Env = {
    ENVIRONMENT: 'test',
    JWT_SECRET: 'test-secret-that-is-long-enough-0123456789',
    GOOGLE_WEB_CLIENT_ID: GOOGLE_AUD,
    AI_PROVIDER: 'none',
    ...opts.env,
  };
  const config = loadConfig(env);
  const clock = { now: T0 };
  const db = opts.db ?? new MemoryDb();
  const mailer = new MemoryMailer();
  const google = await makeIssuer('https://accounts.google.com', GOOGLE_AUD);
  const apple = await makeIssuer('https://appleid.apple.com', 'com.client.repwise');
  const play = new FakePlay();
  const deps: Deps = {
    config,
    db: async () => db,
    now: () => clock.now,
    mailer,
    verifyGoogle: googleVerifier(config.google.audiences, google.jwks),
    verifyApple: appleVerifier(config.apple.audiences, apple.jwks),
    appleStore: opts.appleStore ?? createAppleStore(config, fetch, () => clock.now),
    play,
    verifyPubsub: opts.verifyPubsub ?? (async () => false),
    planner: opts.planner ?? stubPlanner,
    llm: opts.llm ?? null,
  };
  const app = createApp(() => deps);
  return { app, deps, db, mailer, clock, google, apple, play, env };
}

export async function call(
  t: TestCtx,
  method: string,
  path: string,
  opts: { body?: unknown; token?: string; headers?: Record<string, string>; raw?: BodyInit } = {},
): Promise<{ status: number; body: any; headers: Headers; text: string }> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  let body: BodyInit | undefined = opts.raw;
  if (opts.body !== undefined && method !== 'GET' && method !== 'HEAD') {
    body = JSON.stringify(opts.body);
    headers['content-type'] = 'application/json';
  }
  const res = await t.app.request(path, { method, headers, body }, t.env);
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed, headers: res.headers, text };
}

/** Full email sign-in; returns the token response. */
export async function signInEmail(t: TestCtx, email: string, extra: { token?: string } = {}) {
  const start = await call(t, 'POST', '/auth/email/start', { body: { email } });
  if (start.status !== 200) throw new Error(`email start ${start.status} ${start.text}`);
  const code = /(\d{6})/.exec(t.mailer.sent.at(-1)!.subject)![1];
  const res = await call(t, 'POST', '/auth/email/verify', { body: { email, code }, ...(extra.token ? { token: extra.token } : {}) });
  if (res.status !== 200) throw new Error(`email verify ${res.status} ${res.text}`);
  return res.body as { accessToken: string; refreshToken: string; user: { id: string; email: string | null; anonymous: boolean } };
}

export function row(id: string, updatedAt: number, fields: Record<string, unknown> = {}) {
  return { id, created_at: Math.max(0, updatedAt - 1000), updated_at: updatedAt, deleted_at: null, ...fields };
}
