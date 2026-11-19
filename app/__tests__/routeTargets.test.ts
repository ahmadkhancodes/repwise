/// <reference types="node" />
/**
 * Static route audit: every in-app link target (router.push / Href / notification and widget deep
 * links) must match a file under app/. Catches links to routes that do not exist.
 */
import fs from 'node:fs';
import path from 'node:path';

import { workoutUrl } from '@/features/notifications/logic/responses';
import { ROUTES } from '@/features/today/screens/TodayScreen';
import { trainHref } from '@/features/workout/logic/deepLink';
import { WIDGET_LINKS } from '@/widgets/snapshot';

const ROOT = path.resolve(__dirname, '../..');
const APP = path.join(ROOT, 'app');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '__tests__' || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const isGroup = (s: string) => /^\(.*\)$/.test(s);

/** app/ files → route segment lists (groups dropped, index collapsed, layouts skipped). */
const ROUTE_TABLE = walk(APP)
  .filter((f) => !/(^|\/)(_layout|\+not-found)\.tsx?$/.test(f))
  .map((f) => {
    const segs = path.relative(APP, f).replace(/\.tsx?$/, '').split('/').filter((s) => !isGroup(s));
    if (segs[segs.length - 1] === 'index') segs.pop();
    return segs;
  });

/** Does `url` (an in-app path or a `repwise://` link; `X` = any dynamic value) open a route? */
function resolves(url: string): boolean {
  const p = url.replace(/^repwise:\/\//, '/').split(/[?#]/)[0] ?? '';
  const segs = p.split('/').filter((s) => s && !isGroup(s));
  return ROUTE_TABLE.some(
    (r) => r.length === segs.length && r.every((s, i) => /^\[.*\]$/.test(s) || s === segs[i]),
  );
}

/** Worker API paths also start with '/'; they are not app routes. */
const API = /^\/(auth|billing|sync|ai|account|config)(\/|\*|$)/;

describe('route targets', () => {
  it('the route table sees the app', () => {
    expect(resolves('/')).toBe(true);
    expect(resolves('/train')).toBe(true);
    expect(resolves('/workout/abc')).toBe(true);
    expect(resolves('/workout/abc/summary')).toBe(true);
    expect(resolves('/nope')).toBe(false);
  });

  it('known link constants open real routes', () => {
    const links = [
      ROUTES.onboarding,
      ROUTES.train,
      ROUTES.settings,
      ROUTES.checkin,
      ROUTES.workout('s1'),
      trainHref('s1'),
      trainHref('s1', false),
      workoutUrl('s1', true),
      workoutUrl(undefined, false),
      WIDGET_LINKS.today,
      WIDGET_LINKS.eat,
      WIDGET_LINKS.quickLog,
      WIDGET_LINKS.progress,
      WIDGET_LINKS.workout('s1', true),
      WIDGET_LINKS.workout(null, false),
    ].map(String);
    expect(links.filter((l) => !resolves(l))).toEqual([]);
  });

  it('every route literal in src/ and app/ opens a real route', () => {
    const broken: string[] = [];
    const literal = /(['"`])((?:repwise:\/)?\/[a-z(][^'"`\s]*)\1/g;
    for (const file of [...walk(path.join(ROOT, 'src')), ...walk(APP)]) {
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(literal)) {
        const url = (m[2] ?? '').replace(/\$\{[^}]*\}/g, 'X');
        if (API.test(url)) continue;
        if (!resolves(url)) broken.push(`${path.relative(ROOT, file)}: ${m[2]}`);
      }
    }
    expect(broken).toEqual([]);
  });
});
