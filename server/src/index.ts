import { AnthropicProvider } from './ai/anthropic';
import { createEnginePlanner } from './ai/enginePlanner';
import { createApp } from './app';
import { appleVerifier, googleVerifier } from './auth/idtokens';
import { ConsoleMailer, ResendMailer } from './auth/mailer';
import { createAppleStore } from './billing/apple';
import { createPlayApi, pubsubVerifier } from './billing/play';
import { loadConfig } from './config';
import { MongoDb } from './db/mongo';
import type { Env } from './env';
import { HttpError } from './lib/http';
import type { Deps } from './types';

/** Production wiring. Built once per isolate (per env object) so JWKS, tokens and the DB client are reused. */
const cache = new WeakMap<object, Deps>();

export function buildDeps(env: Env): Deps {
  const hit = cache.get(env);
  if (hit) return hit;
  const config = loadConfig(env);
  const now = () => Date.now();
  const f: typeof fetch = (...args) => fetch(...args);
  const deps: Deps = {
    config,
    db: () => {
      if (!env.MONGODB_URI) return Promise.reject(new HttpError(503, 'not_configured'));
      return MongoDb.connect(env.MONGODB_URI, env.MONGODB_DB || 'repwise');
    },
    now,
    mailer: config.mail.provider === 'resend' && config.mail.resendKey ? new ResendMailer(config.mail.resendKey, config.mail.from, f) : new ConsoleMailer(config.environment),
    verifyGoogle: googleVerifier(config.google.audiences),
    verifyApple: appleVerifier(config.apple.audiences),
    appleStore: createAppleStore(config, f, now),
    play: createPlayApi(config, f, now),
    verifyPubsub: pubsubVerifier(config),
    // @repwise/engine over the bundled @repwise/content catalogues (rules-only without an LLM).
    planner: createEnginePlanner({ clock: now }),
    llm: config.ai.provider === 'anthropic' && config.ai.apiKey ? new AnthropicProvider(config.ai.apiKey, config.ai.model, f) : null,
  };
  cache.set(env, deps);
  return deps;
}

const app = createApp(buildDeps);

export default {
  fetch: (req: Request, env: Env, ctx: unknown) => app.fetch(req, env, ctx as never),
};
