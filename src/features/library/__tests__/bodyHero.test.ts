import { colors } from '@/theme';
import { contrastRatio } from '@/theme/contrast';

import {
  MUSCLE_SHAPES,
  VIEW_H,
  VIEW_W,
  bestView,
  focusBox,
  hitTest,
  pointInPolygon,
  viewMuscles,
} from '../logic/bodyMap';
import { HEAT_FLOOR, bodyPalette, heatColor, heatLegend } from '../logic/bodyPalette';
import { mixColor } from '../logic/color';
import { EQUIPMENT_GLYPH, LEVEL_GLYPH, mainEquipment } from '../logic/glyphs';
import { heroLabel, heroLayout, heroOverlay } from '../logic/hero';
import { EQUIPMENT, LEVELS } from '../logic/labels';
import { EMPTY_FILTERS, QUICK_MUSCLES, muscleRail, toggleMuscle } from '../logic/filters';
import { CROSSFADE, crossfadeCycleMs, crossfadeOpacity } from '../logic/media';

describe('body geometry', () => {
  it('lists the muscles of each side', () => {
    expect(viewMuscles('front')).toEqual(expect.arrayContaining(['chest', 'quads', 'abs']));
    expect(viewMuscles('front')).not.toContain('lats');
    expect(viewMuscles('back')).toEqual(expect.arrayContaining(['lats', 'glutes', 'triceps']));
  });

  it('picks the side that shows the main muscles', () => {
    expect(bestView(['lats'], ['biceps'])).toBe('back');
    expect(bestView(['chest'], ['triceps'])).toBe('front');
    // Tie on main muscles: the first (most important) one decides.
    expect(bestView(['quads', 'glutes'], ['hamstrings', 'lower_back'])).toBe('front');
    expect(bestView(['glutes', 'quads'], [])).toBe('back');
    // Muscles on both sides only: secondaries decide, then the front.
    expect(bestView(['side_delts'], ['traps', 'rear_delts'])).toBe('back');
    expect(bestView([], [])).toBe('front');
  });

  it('hit-tests points inside muscle polygons', () => {
    expect(hitTest('front', 40, 45)).toBe('chest');
    expect(hitTest('front', 40, 120)).toBe('quads');
    expect(hitTest('back', 38, 65)).toBe('lats');
    expect(hitTest('front', 2, 2)).toBeNull();
    expect(
      pointInPolygon(1, 1, [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
      ]),
    ).toBe(true);
    expect(
      pointInPolygon(3, 1, [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
      ]),
    ).toBe(false);
  });

  it('keeps a polygon for every drawn shape', () => {
    for (const view of ['front', 'back'] as const)
      for (const shapes of Object.values(MUSCLE_SHAPES[view]))
        for (const s of shapes ?? []) {
          expect(s.points.length).toBeGreaterThanOrEqual(3);
          expect(s.d.startsWith('M')).toBe(true);
        }
  });

  it('frames a square crop on the main muscles, inside the figure', () => {
    const chest = focusBox('front', ['chest']);
    expect(chest.w).toBe(chest.h);
    expect(chest.w).toBeGreaterThanOrEqual(64);
    expect(chest.y).toBeLessThan(45);
    expect(chest.y + chest.h).toBeGreaterThan(45);
    const calves = focusBox('back', ['calves']);
    expect(calves.y + calves.h).toBeLessThanOrEqual(VIEW_H);
    expect(calves.y).toBeGreaterThan(chest.y);
    const none = focusBox('front', []);
    expect(none.x).toBeCloseTo((VIEW_W - none.w) / 2);
    const whole = focusBox('front', ['calves', 'traps'], 10);
    expect(whole.h).toBeLessThanOrEqual(VIEW_H);
  });
});

describe.each(['light', 'dark'] as const)('body palette (%s)', (scheme) => {
  const c = colors[scheme];
  it.each(['bg', 'surface'] as const)('figure stands off the %s backdrop', (backdrop) => {
    const p = bodyPalette(c, scheme, backdrop);
    expect(p.figure).not.toBe(c[backdrop]);
    expect(p.idle).not.toBe(p.figure);
    expect(p.secondary).not.toBe(p.primary);
    expect(p.primary).toBe(c.accent);
    // Secondary must read on the figure (not the pale accentSoft alone).
    expect(contrastRatio(p.secondary, p.figure)).toBeGreaterThan(
      contrastRatio(c.accentSoft, p.figure),
    );
  });

  it('heat colours rise with fatigue and the legend uses the same maths', () => {
    const p = bodyPalette(c, scheme, 'bg');
    expect(heatColor(p, 0)).toBe(p.idle);
    expect(heatColor(p, HEAT_FLOOR)).toBe(p.idle);
    expect(heatColor(p, 1).toLowerCase()).toBe(c.accent.toLowerCase());
    expect(heatColor(p, Number.NaN)).toBe(p.idle);
    expect(heatLegend(p).map((l) => l.color)).toEqual([
      heatColor(p, 0),
      heatColor(p, 0.35),
      heatColor(p, 1),
    ]);
  });
});

describe('mixColor', () => {
  it('blends hex tokens and clamps', () => {
    const { inverse: black, onInverse: white, scrim } = colors.light;
    expect(mixColor(black, white, 0.5)).toBe(mixColor(white, black, 0.5));
    expect(mixColor(black, white, 2).toLowerCase()).toBe(white.toLowerCase());
    expect(mixColor(black, white, 0).toLowerCase()).toBe(black.toLowerCase());
    // Non-hex tokens (rgba scrim) snap instead of producing junk.
    expect(mixColor(scrim, white, 0.2)).toBe(scrim);
  });
});

describe('hero', () => {
  it('has a glyph for every kit and level', () => {
    for (const e of EQUIPMENT) expect(EQUIPMENT_GLYPH[e]).toBeTruthy();
    for (const l of LEVELS) expect(LEVEL_GLYPH[l]).toBeTruthy();
    expect(mainEquipment(['bench', 'barbell'])).toBe('barbell');
    expect(mainEquipment(['bench'])).toBe('bench');
    expect(mainEquipment([])).toBeNull();
  });

  it('lays the figure out right of the overlays, inside the box', () => {
    const l = heroLayout(320, 4 / 3, 16);
    expect(l.height).toBe(240);
    expect(l.y).toBeGreaterThanOrEqual(0);
    expect(l.y + VIEW_H * l.scale).toBeLessThanOrEqual(240);
    expect(l.x + VIEW_W * l.scale).toBeLessThanOrEqual(320 - 16);
    expect(l.textWidth).toBeGreaterThan(100);
    expect(heroLayout(0, 4 / 3, 16).scale).toBe(0);
  });

  it('builds overlay copy and a spoken label', () => {
    const e = {
      primaryMuscles: ['lats'] as const,
      secondaryMuscles: ['biceps'] as const,
      equipment: ['cable', 'bench'] as const,
      patternFamily: 'pull_v' as const,
      level: 'beginner' as const,
    };
    expect(heroOverlay(e)).toEqual({
      level: 'Beginner',
      pattern: 'Vertical pull',
      equipment: 'Cable',
      equipmentKey: 'cable',
    });
    expect(heroOverlay(null).level).toBeNull();
    expect(heroLabel('Lat pulldown', e, 'back', false)).toBe(
      'Lat pulldown. Back view. Main: Lats. Also: Biceps. Cable, Vertical pull, Beginner.',
    );
    expect(heroLabel('Lat pulldown', null, 'front', true)).toBe('Lat pulldown demonstration.');
  });

  it('times the 2-frame crossfade loop', () => {
    expect(crossfadeCycleMs()).toBe(2 * (CROSSFADE.holdMs + CROSSFADE.fadeMs));
    expect(crossfadeOpacity(crossfadeCycleMs())).toBe(0);
  });
});

describe('muscle chips', () => {
  it('toggles a group and never hides a selection made in the sheet', () => {
    const on = toggleMuscle(EMPTY_FILTERS, 'chest');
    expect(on.muscles).toEqual(['chest']);
    expect(toggleMuscle(on, 'chest').muscles).toEqual([]);
    expect(muscleRail(EMPTY_FILTERS)).toEqual([...QUICK_MUSCLES]);
    expect(muscleRail({ ...EMPTY_FILTERS, muscles: ['forearms', 'chest'] })[0]).toBe('forearms');
  });
});
