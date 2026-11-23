import { fireEvent, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { renderThemed, SCHEMES } from '../../../../test/render';
import { StatsGrid } from '../components/StatsGrid';
import { buildStats, type StatsInput } from '../logic/stats';

const input: StatsInput = {
  eatenKcal: 1240,
  targetKcal: 2300,
  eatenProtein: 92,
  targetProtein: 160,
  steps: { kind: 'on', steps: 6420 },
  stepsGoal: 8000,
  week: { planned: 4, done: 2 },
  streakWeeks: 3,
  volumeKg: 12450,
  weight: { values: [82, 81.6, 81.2], latestKg: 81.2, deltaKg: -0.8 },
  units: 'metric',
};

async function renderGrid(i: StatsInput, scheme: 'light' | 'dark' = 'light') {
  const handlers = {
    onOpenEat: jest.fn(),
    onOpenProgress: jest.fn(),
    onLogWeight: jest.fn(),
    onEnableSteps: jest.fn(),
  };
  await renderThemed(<StatsGrid tiles={buildStats(i)} weightValues={i.weight.values} {...handlers} />, scheme);
  return handlers;
}

describe.each(SCHEMES)(`StatsGrid (%s, ${Platform.OS})`, (scheme) => {
  it('shows every stat with spoken labels', async () => {
    await renderGrid(input, scheme);
    expect(screen.getByTestId('today-stats')).toBeTruthy();
    expect(screen.getByTestId('stat-calories-value')).toHaveTextContent('1,240');
    expect(screen.getByTestId('stat-steps-value')).toHaveTextContent('6,420');
    expect(screen.getByTestId('stat-workouts-value')).toHaveTextContent('2/4');
    expect(screen.getByTestId('stat-streak-value')).toHaveTextContent('3');
    expect(screen.getByTestId('stat-volume-value')).toHaveTextContent('12.4 t');
    expect(screen.getByTestId('stat-weight-value')).toHaveTextContent('81.2 kg');
    expect(screen.getByTestId('stat-weight-spark', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByLabelText('Steps: 6,420 of 8,000')).toBeTruthy();
    expect(screen.getAllByLabelText('Calories: 1,240 of 2,300 kcal eaten').length).toBeGreaterThan(0);
  });
});

describe(`StatsGrid actions (${Platform.OS})`, () => {
  it('calories and protein open Eat; training tiles open Progress', async () => {
    const h = await renderGrid(input);
    await fireEvent.press(screen.getByTestId('stat-calories'));
    await fireEvent.press(screen.getByTestId('stat-protein'));
    expect(h.onOpenEat).toHaveBeenCalledTimes(2);
    await fireEvent.press(screen.getByTestId('stat-volume'));
    await fireEvent.press(screen.getByTestId('stat-weight'));
    expect(h.onOpenProgress).toHaveBeenCalledTimes(2);
  });

  it('steps off: "Turn on steps" asks in context', async () => {
    const h = await renderGrid({ ...input, steps: { kind: 'off', reason: 'not_asked' } });
    expect(screen.getByTestId('stat-steps-value')).toHaveTextContent('Turn on steps');
    await fireEvent.press(screen.getByTestId('stat-steps-enable'));
    expect(h.onEnableSteps).toHaveBeenCalledTimes(1);
  });

  it('no step counter: the tile says so and is not a button', async () => {
    await renderGrid({ ...input, steps: { kind: 'off', reason: 'unavailable' } });
    expect(screen.getByTestId('stat-steps-detail')).toHaveTextContent('Not on this phone');
    expect(screen.queryByTestId('stat-steps-enable')).toBeNull();
  });

  it('no weigh-ins: the weight tile opens the log', async () => {
    const h = await renderGrid({ ...input, weight: { values: [], latestKg: null, deltaKg: null } });
    await fireEvent.press(screen.getByTestId('stat-weight-enable'));
    expect(h.onLogWeight).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('stat-weight-spark', { includeHiddenElements: true })).toBeNull();
  });
});
