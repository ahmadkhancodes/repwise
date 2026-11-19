import type { Planner } from './ai/planner';
import type { LlmProvider } from './ai/provider';
import type { IdTokenVerifier } from './auth/idtokens';
import type { Mailer } from './auth/mailer';
import type { AppleStore } from './billing/apple';
import type { PlayApi } from './billing/play';
import type { Config } from './config';
import type { Db, UserDoc } from './db/types';
import type { Env } from './env';

/** Everything a request handler needs. Built once per isolate in production, injected in tests. */
export interface Deps {
  config: Config;
  /** Lazy so /health and /config never touch the database. */
  db: () => Promise<Db>;
  now: () => number;
  mailer: Mailer;
  verifyGoogle: IdTokenVerifier;
  verifyApple: IdTokenVerifier;
  appleStore: AppleStore;
  play: PlayApi;
  /** Checks the Pub/Sub push request (OIDC bearer or shared secret). */
  verifyPubsub: (req: { authorization?: string | undefined; token?: string | undefined }) => Promise<boolean>;
  planner: Planner;
  llm: LlmProvider | null;
}

export interface AppEnv {
  Bindings: Env;
  Variables: {
    deps: Deps;
    userId: string;
    user: UserDoc | null;
  };
}
