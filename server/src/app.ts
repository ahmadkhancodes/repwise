import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { cors } from 'hono/cors';
import { HttpError } from './lib/http';
import { securityHeaders } from './lib/middleware';
import { accountRoutes } from './routes/account';
import { aiRoutes } from './routes/ai';
import { authRoutes } from './routes/auth';
import { billingRoutes } from './routes/billing';
import { metaRoutes } from './routes/meta';
import { syncRoutes } from './routes/sync';
import { webhookRoutes } from './routes/webhooks';
import type { Env } from './env';
import type { AppEnv, Deps } from './types';

export function createApp(resolveDeps: (env: Env) => Deps) {
  const app = new Hono<AppEnv>();

  app.use('*', securityHeaders);
  app.use('*', async (c, next) => {
    c.set('deps', resolveDeps(c.env ?? {}));
    await next();
  });
  app.use('*', async (c, next) => {
    const origins = c.get('deps').config.corsOrigins;
    // Native apps send no Origin. No cookies anywhere, so credentials are never allowed.
    return cors({
      origin: origins.length > 0 ? origins : '*',
      allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type'],
      credentials: false,
      maxAge: 600,
    })(c, next);
  });

  app.route('/', metaRoutes);
  app.route('/auth', authRoutes);
  app.route('/sync', syncRoutes);
  app.route('/account', accountRoutes);
  app.route('/billing', billingRoutes);
  app.route('/webhooks', webhookRoutes);
  app.route('/ai', aiRoutes);

  app.notFound((c) => c.json({ error: 'not_found' }, 404));

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      for (const [k, v] of Object.entries(err.headers ?? {})) c.header(k, v);
      const body: Record<string, string> = { error: err.code };
      if (err.message && err.message !== err.code) body.message = err.message;
      return c.json(body, err.status as 400);
    }
    if (err instanceof HTTPException) return c.json({ error: 'request_error' }, err.status);
    // Log the class and a short message server-side only; the client never sees details or stacks.
    console.error('unhandled', err instanceof Error ? `${err.name}: ${err.message.slice(0, 200)}` : 'non-error thrown');
    return c.json({ error: 'internal' }, 500);
  });

  return app;
}
