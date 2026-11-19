import {
  FREE_CARDS_PER_DAY,
  SNOOZE_MS,
  decodeAction,
  decodeCopy,
  encodeAction,
  encodeCopy,
  formatState,
  isVisible,
  missingRows,
  parseState,
  snoozeState,
  visibleCards,
} from '../logic/cardState';
import {
  PRIORITY,
  checkinDueRule,
  deloadRule,
  evaluateRules,
  missedWorkoutRule,
  proteinLowRule,
  recoveryRule,
  rescheduleTarget,
  streakLength,
  streakRule,
  type RuleContext,
  type RuleSession,
} from '../logic/rules';

const TODAY = '2026-11-19'; // Thursday

function ctx(over: Partial<RuleContext> = {}): RuleContext {
  return {
    today: TODAY,
    hour: 10,
    daysSinceOnboarding: 10,
    sessions: [],
    protein: null,
    activeDates: [],
    lastCheckinDate: null,
    lifts: [],
    deloadRequested: false,
    ...over,
  };
}

const sess = (id: string, date: string, status: RuleSession['status'] = 'planned', title = 'Push day'): RuleSession => ({
  id,
  date,
  status,
  title,
});

describe('C3 missed workout', () => {
  it('moves a missed session to today when today is free', () => {
    const c = missedWorkoutRule(ctx({ sessions: [sess('a', '2026-11-17')] }));
    expect(c?.title).toBe("Missed Tuesday's Push day");
    expect(c?.action).toEqual({ type: 'reschedule', sessionId: 'a', toDate: TODAY });
    expect(c?.actionLabel).toBe('Move to today');
  });

  it('moves to tomorrow when today is busy, else offers to skip', () => {
    const busyToday = [sess('a', '2026-11-18'), sess('b', TODAY)];
    expect(missedWorkoutRule(ctx({ sessions: busyToday }))?.action).toEqual({
      type: 'reschedule',
      sessionId: 'a',
      toDate: '2026-11-20',
    });
    const busyBoth = [...busyToday, sess('c', '2026-11-20')];
    expect(missedWorkoutRule(ctx({ sessions: busyBoth }))?.action).toEqual({ type: 'skip_session', sessionId: 'a' });
  });

  it('ignores done, skipped, today and old sessions; picks the latest miss', () => {
    expect(missedWorkoutRule(ctx({ sessions: [sess('a', '2026-11-18', 'done')] }))).toBeNull();
    expect(missedWorkoutRule(ctx({ sessions: [sess('a', '2026-11-18', 'skipped')] }))).toBeNull();
    expect(missedWorkoutRule(ctx({ sessions: [sess('a', TODAY)] }))).toBeNull();
    expect(missedWorkoutRule(ctx({ sessions: [sess('a', '2026-11-15')] }))).toBeNull();
    const two = missedWorkoutRule(ctx({ sessions: [sess('a', '2026-11-16'), sess('b', '2026-11-18', 'planned', 'Legs')] }));
    expect(two?.title).toBe("Missed Wednesday's Legs");
  });

  it('rescheduleTarget treats skipped sessions as free', () => {
    expect(rescheduleTarget(TODAY, [sess('x', TODAY, 'skipped')])).toBe(TODAY);
  });
});

describe('weekly check-in due', () => {
  const sunday = '2026-11-22';
  it('fires on Sunday or Monday after the first week', () => {
    expect(checkinDueRule(ctx({ today: sunday }))?.action).toEqual({ type: 'open_checkin' });
    expect(checkinDueRule(ctx({ today: '2026-11-23' }))).not.toBeNull();
    expect(checkinDueRule(ctx({ today: TODAY }))).toBeNull();
    expect(checkinDueRule(ctx({ today: sunday, daysSinceOnboarding: 3 }))).toBeNull();
  });

  it('not again within 6 days of the last check-in', () => {
    expect(checkinDueRule(ctx({ today: '2026-11-23', lastCheckinDate: sunday }))).toBeNull();
    expect(checkinDueRule(ctx({ today: sunday, lastCheckinDate: '2026-11-15' }))).not.toBeNull();
  });
});

describe('C2 protein low', () => {
  it('fires from 18:00 below 80% of target', () => {
    const c = proteinLowRule(ctx({ hour: 18, protein: { eaten: 100, target: 160 } }));
    expect(c?.title).toBe('60 g protein to go');
    expect(c?.action).toEqual({ type: 'open_eat' });
  });

  it('stays quiet before 18:00, at 80%+ or without a target', () => {
    expect(proteinLowRule(ctx({ hour: 17, protein: { eaten: 10, target: 160 } }))).toBeNull();
    expect(proteinLowRule(ctx({ hour: 20, protein: { eaten: 128, target: 160 } }))).toBeNull();
    expect(proteinLowRule(ctx({ hour: 20, protein: { eaten: 0, target: 0 } }))).toBeNull();
    expect(proteinLowRule(ctx({ hour: 20, protein: null }))).toBeNull();
  });
});

describe('C4 deload', () => {
  it('suggests a lighter week after 2 stalled sessions (engine stalledSessions)', () => {
    const c = deloadRule(
      ctx({ lifts: [{ exerciseId: 'bench', name: 'Bench press', bestE1rmBySession: [90, 93, 93, 92] }] }),
    );
    expect(c?.title).toBe('Bench press has stalled');
    expect(c?.body).toContain('2 sessions');
    expect(c?.action).toEqual({ type: 'plan_deload' });
  });

  it('not when progressing or already requested', () => {
    const lifts = [{ exerciseId: 'bench', name: 'Bench press', bestE1rmBySession: [90, 92, 94] }];
    expect(deloadRule(ctx({ lifts }))).toBeNull();
    const stalled = [{ exerciseId: 'bench', name: 'Bench press', bestE1rmBySession: [90, 90, 90] }];
    expect(deloadRule(ctx({ lifts: stalled, deloadRequested: true }))).toBeNull();
  });
});

describe('C5 recovery', () => {
  const five = ['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18'].map((d, i) =>
    sess(`d${i}`, d, 'done'),
  );
  it('suggests rest after 5 workouts in 5 days when today has a session', () => {
    const c = recoveryRule(ctx({ sessions: [...five, sess('t', TODAY)] }));
    expect(c?.action).toEqual({ type: 'rest_today', sessionId: 't' });
  });
  it('not with fewer workouts or no session today', () => {
    expect(recoveryRule(ctx({ sessions: [...five.slice(1), sess('t', TODAY)] }))).toBeNull();
    expect(recoveryRule(ctx({ sessions: five }))).toBeNull();
  });
});

describe('streak', () => {
  it('counts back from today, or from yesterday while today is open', () => {
    expect(streakLength(['2026-11-17', '2026-11-18', TODAY], TODAY)).toBe(3);
    expect(streakLength(['2026-11-16', '2026-11-17', '2026-11-18'], TODAY)).toBe(3);
    expect(streakLength(['2026-11-15', '2026-11-17', '2026-11-18'], TODAY)).toBe(2);
    expect(streakLength([], TODAY)).toBe(0);
  });
  it('celebrates milestones only', () => {
    expect(streakRule(ctx({ activeDates: ['2026-11-17', '2026-11-18', TODAY] }))?.title).toBe('3-day streak');
    expect(streakRule(ctx({ activeDates: ['2026-11-18', TODAY] }))).toBeNull();
  });
});

describe('evaluateRules', () => {
  it('returns every card that fires, highest priority first', () => {
    const cards = evaluateRules(
      ctx({
        today: '2026-11-22',
        hour: 19,
        sessions: [sess('a', '2026-11-21')],
        protein: { eaten: 50, target: 150 },
        activeDates: ['2026-11-20', '2026-11-21', '2026-11-22'],
      }),
    );
    expect(cards.map((c) => c.ruleId)).toEqual(['missed_workout', 'checkin_due', 'protein_low', 'streak']);
    expect(cards.map((c) => c.priority)).toEqual([
      PRIORITY.missed_workout,
      PRIORITY.checkin_due,
      PRIORITY.protein_low,
      PRIORITY.streak,
    ]);
  });

  it('nothing before onboarding', () => {
    expect(evaluateRules(ctx({ daysSinceOnboarding: null, sessions: [sess('a', '2026-11-18')] }))).toEqual([]);
  });

  it('copy never uses medical words', () => {
    const all = evaluateRules(
      ctx({
        today: '2026-11-22',
        hour: 20,
        sessions: [sess('a', '2026-11-21')],
        protein: { eaten: 1, target: 150 },
        activeDates: ['2026-11-20', '2026-11-21', '2026-11-22'],
        lifts: [{ exerciseId: 'b', name: 'Bench', bestE1rmBySession: [1, 1, 1] }],
      }),
    );
    for (const c of all) expect(`${c.title} ${c.body} ${c.detail}`).not.toMatch(/\b(cure|treat|diagnose)/i);
  });
});

describe('card state', () => {
  const cand = evaluateRules(
    ctx({ today: '2026-11-22', hour: 19, sessions: [sess('a', '2026-11-21')], protein: { eaten: 0, target: 100 } }),
  );

  it('round-trips state, copy and action', () => {
    expect(parseState(null)).toEqual({ kind: 'active' });
    expect(parseState('dismissed')).toEqual({ kind: 'dismissed' });
    expect(parseState('snoozed:123')).toEqual({ kind: 'snoozed', until: 123 });
    expect(formatState({ kind: 'snoozed', until: 5.4 })).toBe('snoozed:5');
    expect(snoozeState(1000)).toBe(`snoozed:${1000 + SNOOZE_MS}`);
    const c = cand[0]!;
    expect(decodeCopy(encodeCopy(c))).toEqual({ title: c.title, body: c.body, detail: c.detail, actionLabel: c.actionLabel });
    expect(decodeAction(encodeAction(c.action))).toEqual(c.action);
    expect(encodeAction(null)).toBeNull();
    expect(decodeCopy('nope')).toBeNull();
    expect(decodeAction('{"x":1}')).toBeNull();
  });

  it('visibility: active and expired snoozes show; dismissed, applied and live snoozes hide', () => {
    expect(isVisible('active', 0)).toBe(true);
    expect(isVisible('snoozed:100', 100)).toBe(true);
    expect(isVisible('snoozed:100', 99)).toBe(false);
    expect(isVisible('dismissed', 0)).toBe(false);
    expect(isVisible('applied', 0)).toBe(false);
  });

  it('free users get one card a day; Pro gets all', () => {
    expect(missingRows(cand, [], false)).toHaveLength(FREE_CARDS_PER_DAY);
    expect(missingRows(cand, [{ id: '1', ruleId: 'missed_workout', state: 'dismissed' }], false)).toEqual([]);
    expect(missingRows(cand, [{ id: '1', ruleId: 'missed_workout', state: 'active' }], true).map((c) => c.ruleId)).toEqual(
      cand.slice(1).map((c) => c.ruleId),
    );
    const stored = cand.map((c, i) => ({ id: String(i), ruleId: c.ruleId, state: 'active' }));
    expect(visibleCards(cand, stored, 0, true)).toHaveLength(cand.length);
    expect(visibleCards(cand, stored, 0, false)).toHaveLength(1);
    stored[0]!.state = 'dismissed';
    expect(visibleCards(cand, stored, 0, true)[0]?.ruleId).toBe(cand[1]!.ruleId);
    // A stored row whose rule stopped firing is not shown.
    expect(visibleCards([], stored, 0, true)).toEqual([]);
  });
});
