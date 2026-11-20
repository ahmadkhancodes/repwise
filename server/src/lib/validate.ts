import type { Context } from 'hono';
import type { z } from 'zod';
import { KB, badRequest, readJson } from './http';

const CODE = /^[a-z][a-z0-9_]{1,63}$/;

/**
 * The client-facing error code for a failed parse: a schema's own code (`{ error: 'invalid_email' }`)
 * when it set one, else `invalid_<field>` for the first failing field, else `invalid_request`.
 */
export function issueCode(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'invalid_request';
  if (CODE.test(issue.message)) return issue.message;
  const field = issue.path.find((p): p is string => typeof p === 'string');
  return field && /^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(field) ? `invalid_${field.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)}` : 'invalid_request';
}

/** Validate any value against a zod schema; failures are 400 with a stable code (never zod's text). */
export function parseWith<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const r = schema.safeParse(value);
  if (!r.success) throw badRequest(issueCode(r.error));
  return r.data;
}

/** Read a JSON object body under a byte cap (413), then validate it (400). */
export async function parseJson<S extends z.ZodType>(c: Context, schema: S, maxBytes = 32 * KB): Promise<z.output<S>> {
  return parseWith(schema, await readJson(c, maxBytes));
}

/** Validate the query string (each key's first value). */
export function parseQuery<S extends z.ZodType>(c: Context, schema: S): z.output<S> {
  return parseWith(schema, c.req.query());
}
