/**
 * Reduce-motion guard: every Reanimated layout animation (`entering`, `exiting`, `layout`) in the
 * app goes through the shared helper (`safe(...)` from useMotionSafe, or the list helpers
 * enterAt / exitFade / layoutSpring, which use motionSafe). Under Reduce Motion / Android "Remove
 * animations" a raw delayed entering could leave content at opacity 0 (device bug, r2-native).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const ALLOWED = /^(safe|enterAt|exitFade|layoutSpring)\(/;
/** RevealParts' `springIn` is `safe(...)` inside (checked below). */
const FILE_ALLOWED: Record<string, RegExp> = {
  'src/features/onboarding/components/RevealParts.tsx': /^springIn\(/,
};

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name === '__tests__' || name === 'node_modules') return [];
    if (statSync(p).isDirectory()) return sources(p);
    return /\.tsx?$/.test(name) ? [p] : [];
  });
}

/** `{ ... }` expression after `at` (the index of its opening brace). Pure. */
function braceExpr(src: string, at: number): string {
  let depth = 0;
  for (let i = at; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at + 1, i).trim();
  }
  throw new Error('unbalanced braces');
}

const files = [...sources(join(ROOT, 'src')), ...sources(join(ROOT, 'app'))];
const uses = files.flatMap((file) => {
  const src = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file);
  return [...src.matchAll(/\b(entering|exiting|layout)=\{/g)].map((m) => ({
    rel,
    line: src.slice(0, m.index).split('\n').length,
    expr: braceExpr(src, m.index! + m[0].length - 1),
  }));
});

describe('reduce-motion guard', () => {
  it('finds the app’s layout animations (the scan works)', () => {
    expect(uses.length).toBeGreaterThan(40);
  });

  it('every entering / exiting / layout animation goes through the shared helper', () => {
    const raw = uses.filter(
      ({ rel, expr }) => !ALLOWED.test(expr) && !(FILE_ALLOWED[rel]?.test(expr) ?? false),
    );
    expect(raw.map(({ rel, line, expr }) => `${rel}:${line} ${expr.slice(0, 50)}`)).toEqual([]);
  });

  it('RevealParts springIn is reduce-motion safe', () => {
    const src = readFileSync(join(ROOT, 'src/features/onboarding/components/RevealParts.tsx'), 'utf8');
    const hook = src.slice(src.indexOf('const useSpringIn'), src.indexOf('};', src.indexOf('const useSpringIn')));
    expect(hook).toMatch(/useMotionSafe\(\)/);
    expect(hook).toMatch(/safe\(\s*FadeInDown/);
  });
});
