import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { cors } from 'hono/cors';
import { HttpError } from './lib/http';
import { requestId } from './lib/log';
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

  // Request id + one structured access-log line per request. Logs the route PATTERN (never the raw
  // URL: query strings can carry secrets such as the Play RTDN `?token=`), status and duration.
  app.use('*', async (c, next) => {
    const deps = resolveDeps(c.env ?? {});
    const reqId = requestId(c.req.header('x-request-id') ?? c.req.header('cf-ray'));
    const log = deps.log.child({ reqId });
    c.set('deps', deps);
    c.set('reqId', reqId);
    c.set('log', log);
    const started = Date.now();
    try {
      await next();
    } finally {
      c.header('x-request-id', reqId);
      const status = c.res.status;
      const fields = { method: c.req.method, route: c.req.routePath, status, ms: Date.now() - started };
      if (status >= 500) log.error('request', fields);
      else if (status >= 400 && status !== 404) log.warn('request', fields);
      else log.info('request', fields);
    }
  });
  app.use('*', securityHeaders);
  app.use('*', async (c, next) => {
    const cfg = c.get('deps').config;
    // Native apps send no Origin, so CORS only matters to browsers. No cookies anywhere, so
    // credentials are never allowed. Production allows only CORS_ORIGINS (none by default);
    // other environments allow any origin for local web tooling.
    const origin = cfg.corsOrigins.length > 0 ? cfg.corsOrigins : cfg.environment === 'production' ? () => null : '*';
    return cors({
      origin,
      allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
      exposeHeaders: ['X-Request-Id', 'Retry-After'],
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
      if (err.status >= 500) c.get('log')?.error('http_error', { errorCode: err.code, statusCode: err.status });
      return c.json(body, err.status as 400);
    }
    if (err instanceof HTTPException) return c.json({ error: 'request_error' }, err.status);
    // The class and a short, redacted message server-side only; the client never sees details or stacks.
    c.get('log')?.error('unhandled', { err: err instanceof Error ? err : 'non-error thrown' });
    return c.json({ error: 'internal' }, 500);
  });

  return app;
}
