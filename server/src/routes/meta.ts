import { Hono } from 'hono';
import type { AppEnv } from '../types';

export const metaRoutes = new Hono<AppEnv>();

metaRoutes.get('/health', (c) => c.json({ ok: true, service: 'repwise-api', time: c.get('deps').now() }));

/** Public feature flags. Never includes secrets. */
metaRoutes.get('/config', (c) => {
  const cfg = c.get('deps').config;
  c.header('Cache-Control', 'public, max-age=300');
  return c.json({
    payments_enabled: cfg.paymentsEnabled,
    ai_provider: c.get('deps').llm ? cfg.ai.provider : 'none',
    plans: cfg.paymentsEnabled ? cfg.plans : null,
    features: cfg.features,
  });
});
