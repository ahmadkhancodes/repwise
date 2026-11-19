/** A scripted fetch for API tests: route handlers by "METHOD /path", every call recorded. */
export type Call = {
  method: string;
  path: string;
  query: string;
  body: unknown;
  auth: string | null;
};
export type Reply =
  { status: number; body?: unknown } | Promise<{ status: number; body?: unknown }>;
type Handler = (call: Call) => Reply;

export function createFakeFetch(base = 'https://api.test') {
  const calls: Call[] = [];
  const routes = new Map<string, Handler>();
  let offline = false;

  const fetch = async (input: string, init: RequestInit = {}): Promise<Response> => {
    if (offline) throw new TypeError('Network request failed');
    const url = new URL(input);
    expect(input.startsWith(base)).toBe(true);
    const headers = (init.headers ?? {}) as Record<string, string>;
    const call: Call = {
      method: init.method ?? 'GET',
      path: url.pathname,
      query: url.search,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      auth: headers.Authorization ?? null,
    };
    calls.push(call);
    const h = routes.get(`${call.method} ${call.path}`);
    const signal = init.signal;
    const reply = h
      ? await Promise.race([
          Promise.resolve(h(call)),
          new Promise<never>((_, reject) =>
            signal?.addEventListener('abort', () => reject(new Error('aborted'))),
          ),
        ])
      : { status: 404, body: { error: 'not_found' } };
    const text = reply.body === undefined ? '' : JSON.stringify(reply.body);
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      text: async () => text,
    } as Response;
  };

  return {
    base,
    fetch,
    calls,
    on(route: string, h: Handler) {
      routes.set(route, h);
    },
    setOffline(v: boolean) {
      offline = v;
    },
    callsTo(route: string) {
      return calls.filter((c) => `${c.method} ${c.path}` === route);
    },
  };
}

export function tokenResponse(
  n: number | string,
  opts: { anonymous?: boolean; id?: string; email?: string | null } = {},
) {
  return {
    accessToken: `at-${n}`,
    refreshToken: `rt-${n}`,
    tokenType: 'Bearer',
    expiresIn: 900,
    user: {
      id: opts.id ?? 'user-1',
      email: opts.email ?? null,
      anonymous: opts.anonymous ?? false,
    },
  };
}
