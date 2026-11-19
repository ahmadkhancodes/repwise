import {
  ACTIVITY_FACTORS,
  GOALS,
  ProfileSchema,
  SEXES,
  activityLevel,
  assessSafety,
  bmi,
  bmrMifflin,
  calorieFloor,
  cmToFtIn,
  computeTargets,
  dayTypeMacros,
  ftInToCm,
  goalCalories,
  kcalFromMacros,
  kcalToKj,
  kgToLb,
  kjToKcal,
  lbToKg,
  lifestyleFromSteps,
  macroBasisKg,
  macroTargets,
  metKcal,
  roundTo,
  tdee,
  weeklyAdjustment,
  weightTrend,
  addDays,
  type ProfileInput,
  type WeighIn,
} from '../src';

const ON = '2026-11-23';

describe('BMR / TDEE (Mifflin-St Jeor)', () => {
  test.each([
    // sex, kg, cm, age, expected (reference calculator values)
    ['male', 80, 180, 30, 1780],
    ['female', 60, 165, 25, 1345.25],
    ['male', 100, 190, 45, 1967.5],
    ['female', 45, 150, 70, 876.5],
    ['male', 300, 230, 16, 4362.5],
  ] as const)('%s %ikg %icm %iy → %f', (sex, kg, cm, age, expected) => {
    expect(bmrMifflin({ sex, weightKg: kg, heightCm: cm, age })).toBeCloseTo(expected, 6);
  });

  test('rejects non-positive inputs', () => {
    expect(() => bmrMifflin({ sex: 'male', weightKg: 0, heightCm: 180, age: 30 })).toThrow(RangeError);
  });

  test('activity factors 1.2–1.725 and level mapping', () => {
    expect(Object.values(ACTIVITY_FACTORS)).toEqual([1.2, 1.375, 1.55, 1.725]);
    expect(activityLevel('sedentary', 0)).toBe('sedentary');
    expect(activityLevel('sedentary', 3)).toBe('light');
    expect(activityLevel('light', 3)).toBe('light');
    expect(activityLevel('moderate', 4)).toBe('moderate');
    expect(activityLevel('active', 2)).toBe('moderate');
    expect(activityLevel('active', 4)).toBe('very_active');
    expect(activityLevel('active', 7)).toBe('very_active');
    expect(tdee(1780, 'moderate')).toBeCloseTo(2759, 0);
    expect(lifestyleFromSteps(3000)).toBe('sedentary');
    expect(lifestyleFromSteps(6000)).toBe('light');
    expect(lifestyleFromSteps(9000)).toBe('moderate');
    expect(lifestyleFromSteps(12000)).toBe('active');
  });

  test('TDEE matches a reference calculator within 1%', () => {
    // Reference: male 80 kg 180 cm 30 y moderate → 2759 kcal
    const t = tdee(bmrMifflin({ sex: 'male', weightKg: 80, heightCm: 180, age: 30 }), 'moderate');
    expect(Math.abs(t - 2759) / 2759).toBeLessThan(0.01);
  });
});

describe('goal calories + floors', () => {
  test('fat loss −15% (BMI < 27) / −20% (BMI ≥ 27), muscle gain +10%, recomp/maintain 0', () => {
    expect(goalCalories({ tdee: 2500, bmr: 1700, sex: 'male', goal: 'fat_loss', bmi: 24 }).kcal).toBe(2130);
    expect(goalCalories({ tdee: 2500, bmr: 1700, sex: 'male', goal: 'fat_loss', bmi: 30 }).kcal).toBe(2000);
    expect(goalCalories({ tdee: 2500, bmr: 1700, sex: 'male', goal: 'muscle_gain' }).kcal).toBe(2750);
    expect(goalCalories({ tdee: 2500, bmr: 1700, sex: 'male', goal: 'recomp' }).kcal).toBe(2500);
    expect(goalCalories({ tdee: 2500, bmr: 1700, sex: 'male', goal: 'maintain' }).kcal).toBe(2500);
  });

  test('explicit adjustment is clamped to the goal range', () => {
    expect(goalCalories({ tdee: 3000, bmr: 1800, sex: 'male', goal: 'fat_loss', adjustment: -0.5 }).adjustment).toBe(-0.2);
    expect(goalCalories({ tdee: 3000, bmr: 1800, sex: 'male', goal: 'muscle_gain', adjustment: 0.5 }).adjustment).toBe(0.12);
    expect(goalCalories({ tdee: 3000, bmr: 1800, sex: 'male', goal: 'muscle_gain', adjustment: 0.01 }).adjustment).toBe(0.08);
  });

  test('floor = max(BMR×1.1, 1200 F / 1500 M)', () => {
    expect(calorieFloor(900, 'female')).toBe(1200);
    expect(calorieFloor(900, 'male')).toBe(1500);
    expect(calorieFloor(1800, 'male')).toBe(1980);
    const g = goalCalories({ tdee: 1300, bmr: 1000, sex: 'female', goal: 'fat_loss', bmi: 30 });
    expect(g.kcal).toBe(1200);
    expect(g.floorApplied).toBe(true);
  });
});

describe('macros', () => {
  test('protein 1.6–2.2 g/kg, fat ≥ 0.6 g/kg, carbs = rest', () => {
    const m = macroTargets({ kcal: 2500, weightKg: 80, heightCm: 180, goal: 'muscle_gain' });
    expect(m.protein).toBe(144);
    expect(m.fat).toBeGreaterThanOrEqual(48);
    expect(Math.abs(kcalFromMacros(m) - 2500)).toBeLessThanOrEqual(10);
    expect(macroTargets({ kcal: 2500, weightKg: 80, heightCm: 180, goal: 'fat_loss', proteinGPerKg: 5 }).protein).toBe(176);
    expect(macroTargets({ kcal: 2500, weightKg: 80, heightCm: 180, goal: 'fat_loss', proteinGPerKg: 1 }).protein).toBe(128);
  });

  test('heavy bodies use a BMI-27 basis so carbs never go negative', () => {
    expect(macroBasisKg(300, 170)).toBeCloseTo(27 * 1.7 * 1.7, 6);
    const m = macroTargets({ kcal: 1500, weightKg: 300, heightCm: 150, goal: 'fat_loss' });
    expect(m.carbs).toBeGreaterThanOrEqual(0);
    expect(m.fat).toBeGreaterThanOrEqual(Math.ceil(macroBasisKg(300, 150) * 0.6));
  });

  test('very low kcal falls back to fat floor then 1.6 g/kg protein', () => {
    const m = macroTargets({ kcal: 1200, weightKg: 120, heightCm: 200, goal: 'fat_loss' });
    expect(m.carbs).toBeGreaterThanOrEqual(0);
    expect(m.protein).toBeLessThanOrEqual(Math.round(macroBasisKg(120, 200) * 2.0));
  });

  test('keto caps carbs at 30 g', () => {
    const m = macroTargets({ kcal: 2000, weightKg: 70, heightCm: 175, goal: 'maintain', dietType: 'keto' });
    expect(m.carbs).toBe(30);
    expect(Math.abs(kcalFromMacros(m) - 2000)).toBeLessThanOrEqual(10);
  });

  test('carb cycling: training +15%, rest −15%, rest never below floor', () => {
    const base = { kcal: 2000, protein: 150, fat: 60, carbs: 165 };
    const t = dayTypeMacros(base, 'training');
    const r = dayTypeMacros(base, 'rest');
    expect(t.carbs).toBe(190);
    expect(t.kcal).toBe(2100);
    expect(r.carbs).toBe(140);
    expect(r.kcal).toBe(1900);
    const floored = dayTypeMacros(base, 'rest', 1950);
    expect(floored.kcal).toBeGreaterThanOrEqual(1950);
  });
});

describe('weekly adjustment (7-day trend)', () => {
  const series = (start: string, kgs: number[]): WeighIn[] => kgs.map((kg, i) => ({ date: addDays(start, i), kg }));
  const base = { goal: 'fat_loss' as const, onDate: '2026-11-14', currentKcal: 2000, floor: 1500 };

  test('insufficient data → no change', () => {
    const r = weeklyAdjustment({ ...base, weights: series('2026-11-12', [80, 80, 80]) });
    expect(r).toMatchObject({ deltaKcal: 0, reason: 'insufficient_data', trendKgPerWeek: null });
  });

  test('on track → no change', () => {
    // expected −0.5% × 80 = −0.4 kg/week
    const w = [...series('2026-11-01', Array(7).fill(80.4)), ...series('2026-11-08', Array(7).fill(80))];
    expect(weeklyAdjustment({ ...base, weights: w }).reason).toBe('on_track');
  });

  test('fat loss stalled → −100..−200 kcal', () => {
    const w = [...series('2026-11-01', Array(7).fill(80)), ...series('2026-11-08', Array(7).fill(80))];
    const r = weeklyAdjustment({ ...base, weights: w });
    expect(r.deltaKcal).toBeLessThanOrEqual(-100);
    expect(r.deltaKcal).toBeGreaterThanOrEqual(-200);
    expect(r.reason).toBe('slower_than_expected');
  });

  test('losing too fast → +kcal, clamped at 200', () => {
    const w = [...series('2026-11-01', Array(7).fill(82)), ...series('2026-11-08', Array(7).fill(80))];
    const r = weeklyAdjustment({ ...base, weights: w });
    expect(r.deltaKcal).toBe(200);
    expect(r.reason).toBe('faster_than_expected');
  });

  test('muscle gain too fast → −kcal; never below floor', () => {
    const w = [...series('2026-11-01', Array(7).fill(70)), ...series('2026-11-08', Array(7).fill(71))];
    const r = weeklyAdjustment({ ...base, goal: 'muscle_gain', weights: w });
    expect(r.deltaKcal).toBe(-200);
    expect(r.reason).toBe('faster_than_expected');
    const f = weeklyAdjustment({ ...base, goal: 'muscle_gain', weights: w, currentKcal: 1550 });
    expect(f.newKcal).toBe(1550);
    expect(f.reason).toBe('floor');
  });

  test('weight trend line = 7-day rolling average', () => {
    const t = weightTrend(series('2026-11-01', [80, 82, 81]));
    expect(t.map((x) => x.avgKg)).toEqual([80, 81, 81]);
  });
});

describe('units', () => {
  test('round trips', () => {
    expect(lbToKg(kgToLb(80))).toBeCloseTo(80, 9);
    expect(kgToLb(100)).toBeCloseTo(220.462, 3);
    expect(kjToKcal(kcalToKj(2000))).toBeCloseTo(2000, 9);
    expect(kcalToKj(1)).toBe(4.184);
    expect(cmToFtIn(180)).toEqual({ ft: 5, in: 11 });
    expect(cmToFtIn(182.88)).toEqual({ ft: 6, in: 0 });
    expect(ftInToCm(5, 11)).toBeCloseTo(180.34, 2);
    expect(roundTo(0.1 + 0.2, 0.1)).toBe(0.3);
    expect(() => roundTo(1, 0)).toThrow();
  });

  test('imperial-entered profile gives the same targets as metric', () => {
    const metric = ProfileSchema.parse({ goal: 'fat_loss', sex: 'male', birthYear: 1990, heightCm: 180, weightKg: 90, experience: 'beginner', daysPerWeek: 3, sessionMin: 60 });
    const imperial = ProfileSchema.parse({ ...metric, units: 'imperial', heightCm: ftInToCm(5, 10.8661), weightKg: lbToKg(kgToLb(90)) });
    const a = computeTargets(metric, ON);
    const b = computeTargets(imperial, ON);
    expect(Math.abs(a.base.kcal - b.base.kcal)).toBeLessThanOrEqual(10);
    expect(Math.abs(a.base.protein - b.base.protein)).toBeLessThanOrEqual(1);
  });

  test('MET kcal', () => {
    expect(metKcal(8, 70, 30)).toBe(280);
    expect(() => metKcal(0, 70, 30)).toThrow();
  });
});

describe('safety + full targets', () => {
  const p = (over: Partial<ProfileInput> = {}) =>
    ProfileSchema.parse({ goal: 'fat_loss', sex: 'female', birthYear: 1990, heightCm: 165, weightKg: 70, experience: 'beginner', daysPerWeek: 3, sessionMin: 45, ...over });

  test('under-16, underweight fat loss and pregnancy → maintain + consult', () => {
    expect(assessSafety(p({ birthYear: 2012 }), ON)).toMatchObject({ effectiveGoal: 'maintain', flags: ['under_16'], consultProfessional: true });
    expect(assessSafety(p({ weightKg: 48 }), ON).flags).toContain('underweight_fat_loss');
    expect(bmi(48, 165)).toBeLessThan(18.5);
    expect(assessSafety(p({ pregnant: true }), ON).flags).toContain('pregnancy');
    expect(assessSafety(p(), ON)).toMatchObject({ effectiveGoal: 'fat_loss', flags: [], consultProfessional: false });
    expect(assessSafety(p({ weightKg: 48, goal: 'muscle_gain' }), ON).flags).toEqual([]);
  });

  const ages = [16, 100];
  const weights = [30, 300];
  for (const goal of GOALS) for (const sex of SEXES) for (const age of ages) for (const kg of weights) for (const units of ['metric', 'imperial'] as const) {
    test(`targets sane: ${goal} ${sex} ${age}y ${kg}kg ${units}`, () => {
      const prof = p({ goal, sex, birthYear: 2026 - age, weightKg: kg, heightCm: kg === 30 ? 140 : 210, units });
      const t = computeTargets(prof, ON);
      for (const m of [t.base, t.training, t.rest]) {
        for (const v of Object.values(m)) expect(Number.isFinite(v) && v >= 0).toBe(true);
        expect(m.kcal).toBeGreaterThanOrEqual(t.floor);
        expect(Math.abs(kcalFromMacros(m) - m.kcal)).toBeLessThanOrEqual(Math.max(12, m.kcal * 0.15));
      }
      expect(t.training.carbs).toBeGreaterThanOrEqual(t.rest.carbs);
      expect(t.floor).toBeGreaterThanOrEqual(sex === 'female' ? 1200 : 1500);
    });
  }
});
