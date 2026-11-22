import { fullAnswers } from '../__fixtures__/answers';
import {
  EMPTY_ANSWERS,
  answersToProfile,
  bodyDefaults,
  defaultTarget,
  defaultUnits,
  presetFor,
} from '../logic/answers';
import { durationSeconds, resumeHref, stepFromParam } from '../logic/flow';
import {
  defaultMealTimes,
  formatClock,
  fromMinutes,
  mealLabels,
  shiftMealTime,
  toMinutes,
} from '../logic/mealTimes';
import { CUISINE_OPTIONS, DISLIKE_OPTIONS, QUESTIONS } from '../logic/options';
import {
  BUILD_MIN_MS,
  BUILD_STEPS,
  BUILD_LINE_MS,
  BUILD_MAX_MS,
  BUILD_READY,
  BUILD_READY_HOLD_MS,
  BUILD_REDUCED_MS,
  buildLines,
  buildProgress,
  cuisineLine,
  lineAt,
  revealAt,
  scheduleLine,
  formatDay,
  macroShares,
  mealKcal,
  nextTraining,
  revealReady,
  shortTitle,
  weekStrip,
} from '../logic/reveal';
import {
  STEP_IDS,
  firstIncomplete,
  nextStep,
  prevStep,
  progressFor,
  stepIndex,
  validateStep,
  visibleSteps,
  withStepDefaults,
} from '../logic/steps';
import {
  birthYearItems,
  formatHeight,
  formatWeight,
  heightItems,
  nearestValue,
  weightItems,
} from '../logic/units';

const TODAY = '2026-11-19'; // Thursday
const THU = 3;

describe('answers', () => {
  it('picks imperial for US locales only', () => {
    expect(defaultUnits('en-US')).toBe('imperial');
    expect(defaultUnits('en_GB')).toBe('metric');
    expect(defaultUnits('ur-PK')).toBe('metric');
    expect(defaultUnits(null)).toBe('metric');
  });

  it('presets come from the engine kits', () => {
    expect(presetFor('bodyweight')).toEqual(['bodyweight', 'mat']);
    expect(presetFor('home')).toContain('dumbbell');
    expect(presetFor('gym')).toContain('barbell');
  });

  it('body and target defaults', () => {
    expect(bodyDefaults('female')).toEqual({ heightCm: 165, weightKg: 65 });
    expect(bodyDefaults(null).heightCm).toBe(178);
    expect(defaultTarget('fat_loss', 80)).toBe(75);
    expect(defaultTarget('fat_loss', 38)).toBe(35);
    expect(defaultTarget('muscle_gain', 70)).toBe(74);
    expect(defaultTarget('maintain', 70)).toBe(70);
    expect(defaultTarget('fat_loss', null)).toBeNull();
  });

  it('maps answers to the profile row', () => {
    const p = answersToProfile(fullAnswers({ budget: 1, units: 'imperial' }), {
      timezone: 'Europe/London',
      locale: 'en-GB',
    });
    expect(p).toMatchObject({
      goal: 'fat_loss',
      days: 3,
      sessionMin: 45,
      budget: '1',
      activityLevel: 'light',
      mealsPerDay: 3,
      mealTimes: ['08:00', '13:00', '19:00'],
      units: 'imperial',
      timezone: 'Europe/London',
      locale: 'en-GB',
    });
  });

  it('fills safe defaults for skipped answers', () => {
    const p = answersToProfile({ ...EMPTY_ANSWERS, location: null, mealsPerDay: 4 });
    expect(p.equipment).toEqual(['bodyweight', 'mat']);
    expect(p.dietType).toBe('omnivore');
    expect(p.mealTimes).toHaveLength(4);
    expect(p.budget).toBe('2');
  });
});

describe('steps', () => {
  it('has 15 steps and hides the target for maintain and recomp', () => {
    expect(STEP_IDS).toHaveLength(15);
    expect(visibleSteps({ goal: 'fat_loss' })).toContain('target');
    expect(visibleSteps({ goal: 'maintain' })).not.toContain('target');
    expect(nextStep('body', { goal: 'recomp' })).toBe('experience');
    expect(prevStep('experience', { goal: 'recomp' })).toBe('body');
    expect(prevStep('goal', { goal: null })).toBeNull();
    expect(nextStep('meals', { goal: null })).toBeNull();
    expect(stepIndex('about', { goal: null })).toBe(1);
    expect(progressFor('meals', { goal: 'maintain' })).toBe(1);
  });

  it('every step has a question', () => {
    for (const s of STEP_IDS) expect(QUESTIONS[s].title.length).toBeGreaterThan(3);
  });

  it('validates each required step', () => {
    const empty = EMPTY_ANSWERS;
    expect(validateStep('goal', empty, TODAY)).toMatch(/goal/);
    expect(validateStep('about', { ...empty, sex: 'male' }, TODAY)).toMatch(/year/);
    expect(validateStep('about', { ...empty, sex: 'male', birthYear: 2020 }, TODAY)).toMatch(
      /13 to 90/,
    );
    expect(validateStep('body', { ...empty, heightCm: 170 }, TODAY)).toMatch(/weight/);
    expect(validateStep('days', { ...empty, daysPerWeek: 3, trainingWeekdays: [1] }, TODAY)).toBe(
      'Pick 3 days (1 selected).',
    );
    expect(validateStep('equipment', { ...empty, location: 'home' }, TODAY)).toMatch(/equipment/);
    expect(
      validateStep('meals', { ...empty, mealsPerDay: 3, mealTimes: ['08:00'] }, TODAY),
    ).toMatch(/meals/);
    for (const s of ['injuries', 'avoid', 'cuisines'] as const)
      expect(validateStep(s, empty, TODAY)).toBeNull();
    for (const s of STEP_IDS) expect(validateStep(s, fullAnswers(), TODAY)).toBeNull();
  });

  it('checks the target direction against the goal', () => {
    expect(validateStep('target', fullAnswers({ targetKg: 75 }), TODAY)).toMatch(/below/);
    expect(
      validateStep('target', fullAnswers({ goal: 'muscle_gain', targetKg: 60 }), TODAY),
    ).toMatch(/above/);
    expect(validateStep('target', fullAnswers({ targetKg: null }), TODAY)).toBeNull();
  });

  it('applies defaults only where answers are missing', () => {
    const a = withStepDefaults('days', EMPTY_ANSWERS, TODAY, THU);
    expect(a.daysPerWeek).toBe(3);
    expect(a.trainingWeekdays).toContain(THU);
    expect(withStepDefaults('about', EMPTY_ANSWERS, TODAY, THU).birthYear).toBe(1996);
    expect(withStepDefaults('body', { ...EMPTY_ANSWERS, sex: 'female' }, TODAY, THU).weightKg).toBe(
      65,
    );
    expect(withStepDefaults('equipment', EMPTY_ANSWERS, TODAY, THU).location).toBe('gym');
    expect(withStepDefaults('meals', EMPTY_ANSWERS, TODAY, THU).mealTimes).toHaveLength(3);
    expect(withStepDefaults('kitchen', EMPTY_ANSWERS, TODAY, THU)).toMatchObject({
      budget: 2,
      cookMin: 30,
    });
    const kept = fullAnswers({ daysPerWeek: 4, trainingWeekdays: [0, 1, 2, 3] });
    expect(withStepDefaults('days', kept, TODAY, THU).trainingWeekdays).toEqual([0, 1, 2, 3]);
    expect(withStepDefaults('goal', kept, TODAY, THU)).toBe(kept);
  });

  it('finds the first incomplete step', () => {
    expect(firstIncomplete(EMPTY_ANSWERS, TODAY)).toBe('goal');
    expect(firstIncomplete(fullAnswers({ lifestyle: null }), TODAY)).toBe('activity');
    expect(firstIncomplete(fullAnswers(), TODAY)).toBeNull();
  });
});

describe('meal times', () => {
  it('labels and default times per meal count', () => {
    expect(mealLabels(2)).toEqual(['Lunch', 'Dinner']);
    expect(mealLabels(9)).toHaveLength(6);
    expect(defaultMealTimes(1)).toEqual(['12:30', '19:00']);
    for (let n = 2; n <= 6; n++) {
      const times = defaultMealTimes(n).map(toMinutes);
      expect(times).toHaveLength(n);
      expect([...times].sort((a, b) => a - b)).toEqual(times);
    }
  });

  it('shifts a meal within its neighbours', () => {
    const t = ['08:00', '13:00', '19:00'];
    expect(shiftMealTime(t, 1, 15)).toEqual(['08:00', '13:15', '19:00']);
    expect(shiftMealTime(t, 1, -600)).toEqual(['08:00', '08:30', '19:00']);
    expect(shiftMealTime(t, 2, 600)).toEqual(['08:00', '13:00', '23:30']);
    expect(shiftMealTime(t, 0, -600)).toEqual(['05:00', '13:00', '19:00']);
    expect(shiftMealTime(t, 7, 15)).toEqual(t);
  });

  it('formats clocks', () => {
    expect(fromMinutes(-15)).toBe('23:45');
    expect(toMinutes('bad')).toBe(0);
    expect(formatClock('13:05', true)).toBe('1:05 pm');
    expect(formatClock('00:30', true)).toBe('12:30 am');
    expect(formatClock('13:05', false)).toBe('13:05');
  });
});

describe('units', () => {
  it('metric and imperial wheels hold metric values', () => {
    expect(heightItems('metric')[0]).toEqual({ value: 130, label: '130 cm' });
    const ft = heightItems('imperial');
    expect(ft.find((i) => i.label === '5′ 10″')?.value).toBeCloseTo(177.8, 1);
    const lb = weightItems('imperial');
    expect(lb.find((i) => i.label === '180 lb')?.value).toBeCloseTo(81.65, 2);
    expect(weightItems('metric')).toHaveLength(216);
    expect(birthYearItems(2026)[0]).toEqual({ value: 2013, label: '2013' });
  });

  it('nearestValue snaps to an item', () => {
    const lb = weightItems('imperial');
    expect(nearestValue(lb, 80)).toBeCloseTo(79.83, 2);
    expect(nearestValue(lb, null)).toBe(lb[0]!.value);
    expect(nearestValue([], 3)).toBeUndefined();
  });

  it('formats body stats', () => {
    expect(formatHeight(177.8, 'imperial')).toBe('5′ 10″');
    expect(formatHeight(177.8, 'metric')).toBe('178 cm');
    expect(formatWeight(81.65, 'imperial')).toBe('180 lb');
    expect(formatWeight(70.04, 'metric')).toBe('70 kg');
  });
});

describe('flow', () => {
  it('resumes where the user left off', () => {
    expect(resumeHref({ phase: 'welcome', step: null, answers: { goal: null } })).toBe('/welcome');
    expect(resumeHref({ phase: 'quiz', step: 'diet', answers: { goal: null } })).toBe('/q/diet');
    expect(resumeHref({ phase: 'quiz', step: 'target', answers: { goal: 'maintain' } })).toBe(
      '/q/goal',
    );
    expect(resumeHref({ phase: 'quiz', step: null, answers: { goal: null } })).toBe('/q/goal');
    expect(resumeHref({ phase: 'notify', step: 'meals', answers: { goal: null } })).toBe('/notify');
    expect(resumeHref({ phase: 'plan', step: 'meals', answers: { goal: null } })).toBe('/plan');
    expect(resumeHref({ phase: 'done', step: null, answers: { goal: null } })).toBe('/today');
  });

  it('parses step params', () => {
    expect(stepFromParam('diet')).toBe('diet');
    expect(stepFromParam(['avoid'])).toBe('avoid');
    expect(stepFromParam('nope')).toBe('goal');
  });

  it('measures onboarding duration', () => {
    expect(durationSeconds(1000, 61_400)).toBe(60);
    expect(durationSeconds(null, 5)).toBe(0);
  });
});

describe('reveal', () => {
  it('plays the build lines for 3–5 s, but "ready" waits for the real plan', () => {
    expect(BUILD_STEPS).toHaveLength(5);
    expect(revealAt(false)).toBeGreaterThanOrEqual(BUILD_MIN_MS);
    expect(revealAt(false)).toBeLessThanOrEqual(BUILD_MAX_MS);
    expect(revealAt(true)).toBe(BUILD_REDUCED_MS);
    expect(revealAt(true)).toBeLessThan(BUILD_MIN_MS);

    expect(lineAt(0, false)).toBe(0);
    expect(lineAt(-5, false)).toBe(0);
    expect(lineAt(BUILD_LINE_MS * 2, true)).toBe(2);
    expect(lineAt(10_000, false)).toBe(4);
    expect(lineAt(10_000, true)).toBe(5);

    expect(buildProgress(0, true)).toBe(0);
    expect(buildProgress(10_000, false)).toBeCloseTo(0.8);
    expect(buildProgress(10_000, true)).toBe(1);
    expect(buildProgress(BUILD_LINE_MS * 2.5, true)).toBeCloseTo(0.5);

    // Plan saved at once: reveal exactly at the end of the sequence.
    expect(revealReady(revealAt(false) - 1, 40)).toBe(false);
    expect(revealReady(revealAt(false), 40)).toBe(true);
    expect(revealReady(10_000, null)).toBe(false);
    // Slow phone: the plan lands at 6 s; "ready" still shows for its hold before the reveal.
    expect(revealReady(6_000, 6_000)).toBe(false);
    expect(revealReady(6_000 + BUILD_READY_HOLD_MS, 6_000)).toBe(true);
    // Reduce motion: short, no hold.
    expect(revealReady(BUILD_REDUCED_MS, 10, true)).toBe(true);
    expect(revealReady(BUILD_REDUCED_MS - 1, 10, true)).toBe(false);
  });

  it('build lines quote the user\'s answers back', () => {
    const lines = buildLines({
      goal: 'muscle_gain',
      daysPerWeek: 4,
      sessionMin: 60,
      location: 'gym',
      dietType: 'omnivore',
      cuisines: [],
      mealsPerDay: 3,
    });
    expect(lines.map((l) => l.text)).toEqual([...BUILD_STEPS, BUILD_READY]);
    expect(lines.map((l) => l.detail)).toEqual([
      'Build muscle',
      'Gym · Barbells, machines, cables',
      '4 days a week · 60 min',
      'American & British meals',
      '3 meals a day',
      null,
    ]);
    const empty = buildLines({
      goal: null,
      daysPerWeek: null,
      sessionMin: null,
      location: null,
      dietType: null,
      cuisines: [],
      mealsPerDay: null,
    });
    expect(empty.map((l) => l.detail)).toEqual([
      null,
      null,
      null,
      'American & British meals',
      null,
      null,
    ]);
    // No medical or AI claims in the copy.
    for (const l of lines) expect(`${l.text} ${l.detail ?? ''}`).not.toMatch(/cure|treat|diagnos|AI\b/i);
  });

  it('schedule and cuisine lines', () => {
    expect(scheduleLine(1, null)).toBe('1 day a week');
    expect(scheduleLine(null, 45)).toBe('45 min');
    expect(scheduleLine(null, null)).toBeNull();
    expect(cuisineLine(['italian'], 'vegan')).toBe('Vegan · Italian meals');
    expect(cuisineLine(['global'], null)).toBe('Meals from everywhere');
    expect(cuisineLine(['global', 'mexican'], 'omnivore')).toBe('Mexican meals');
    expect(cuisineLine(['american', 'british', 'indian', 'mexican'], 'halal')).toBe(
      'Halal · American, British & 2 more',
    );
  });

  it('macro shares sum to about the whole day', () => {
    const s = macroShares({ kcal: 2000, protein: 150, carbs: 200, fat: 67 });
    expect(s.protein).toBeCloseTo(0.3);
    expect(s.carbs).toBeCloseTo(0.4);
    expect(s.protein + s.carbs + s.fat).toBeCloseTo(1, 1);
    expect(macroShares({ kcal: 0, protein: 1000, carbs: 0, fat: 0 }).protein).toBe(1);
  });

  it('formats titles, dates and meal kcal', () => {
    expect(shortTitle('Full body A · Barbell back squat')).toBe('Full body A');
    expect(shortTitle(null)).toBe('');
    expect(formatDay('2027-05-13')).toBe('13 May 2027');
    expect(formatDay('2027-05-13', false)).toBe('13 May');
    expect(formatDay('bad')).toBe('bad');
    expect(mealKcal(410, 1.5)).toBe(615);
    expect(mealKcal(undefined, 2)).toBe(0);
  });

  it('builds the week strip and finds the next training day', () => {
    const dates = [
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
    ];
    const strip = weekStrip(
      dates,
      [
        { date: '2026-11-21', title: 'Upper · Bench press' },
        { date: null, title: 'x' },
      ],
      TODAY,
    );
    expect(strip.map((d) => d.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(strip[3]).toMatchObject({ isToday: true, training: false, dayOfMonth: 19 });
    expect(strip[0]!.isPast).toBe(true);
    expect(strip[5]).toMatchObject({ training: true, title: 'Upper' });
    expect(nextTraining(strip, TODAY)?.date).toBe('2026-11-21');
    expect(nextTraining(strip, '2026-11-22')).toBeNull();
  });
});

describe('dislike options', () => {
  // The engine matches dislikes against ingredient ids/names: each option must hit a real food.
  it('every dislike matches a food in the catalogue', () => {
    const foods = require('@repwise/content/foods.json') as { id: string }[];
    for (const o of DISLIKE_OPTIONS) expect(foods.some((f) => f.id.includes(o.value))).toBe(true);
  });
});

describe('cuisine options (D-CUISINE-DEFAULT)', () => {
  it('lists US/UK-familiar cuisines and "Anything" first, regional cuisines last', () => {
    const values = CUISINE_OPTIONS.map((o) => o.value);
    expect(values.slice(0, 6)).toEqual(['american', 'british', 'mediterranean', 'italian', 'mexican', 'global']);
    expect(values.slice(-5)).toEqual(['middle_eastern', 'north_african', 'gulf', 'indian', 'pakistani']);
    expect(CUISINE_OPTIONS.find((o) => o.value === 'global')?.label).toBe('Anything');
  });
});
