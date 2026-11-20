import { logsForDate } from '@/features/nutrition/repo';
import * as review from '@/services/review';
import { useToastStore } from '@/ui';

import { completesDay, quickAddWater, toggleMeal } from '../actions';
import { todayISO } from '../logic/dates';
import { mealPlanForDate, mealsForPlan } from '../repo';
import { ensureWeekMeals } from '../service';
import { freshDb, onboard } from './helpers';

beforeEach(async () => {
  await freshDb();
  useToastStore.setState({ current: null });
  jest.useRealTimers();
});

describe('completesDay (pure)', () => {
  const day = [
    { id: 'a', status: 'eaten' },
    { id: 'b', status: 'planned' },
    { id: 'c', status: 'skipped' },
  ];
  it('true only when ticking the last open meal', () => {
    expect(completesDay('b', day)).toBe(true);
    expect(completesDay('a', [...day, { id: 'd', status: 'planned' }])).toBe(false);
    expect(completesDay('x', day)).toBe(false);
  });
});

describe('toggleMeal / quickAddWater', () => {
  it('ticks with a silent undo toast, unticks with undo, asks for a review when the day is done', () => {
    jest.useFakeTimers();
    const ask = jest.spyOn(review, 'maybeAskForReview').mockResolvedValue(false);
    onboard();
    const today = todayISO();
    ensureWeekMeals(today);
    const meals = mealsForPlan(mealPlanForDate(today)!.id);
    const [first, ...others] = meals;
    for (const m of others) toggleMeal({ id: m.id, title: 'x', status: 'planned' }, meals);
    expect(ask).not.toHaveBeenCalled();
    const day = mealsForPlan(mealPlanForDate(today)!.id);
    expect(toggleMeal({ id: first!.id, title: 'Oats', status: 'planned' }, day)).toBe(true);
    const toast = useToastStore.getState().current!;
    expect(toast).toMatchObject({ message: 'Oats logged', actionLabel: 'Undo', silent: true });
    jest.advanceTimersByTime(review.REVIEW_DELAY_MS);
    expect(ask).toHaveBeenCalledWith('meals_day_complete');
    toast.onAction?.();
    expect(mealsForPlan(mealPlanForDate(today)!.id).find((m) => m.id === first!.id)!.status).toBe('planned');
    expect(toggleMeal({ id: others[0]!.id, title: 'Lunch', status: 'eaten' })).toBe(true);
    expect(useToastStore.getState().current?.message).toBe('Lunch unticked');
    expect(toggleMeal({ id: 'missing', title: 'x', status: 'planned' })).toBe(false);
    ask.mockRestore();
  });

  it('water: one glass with undo', () => {
    const today = todayISO();
    quickAddWater(today);
    expect(logsForDate(today)).toHaveLength(1);
    expect(useToastStore.getState().current?.message).toBe('250 ml water added');
    useToastStore.getState().current?.onAction?.();
    expect(logsForDate(today)).toHaveLength(0);
  });
});
