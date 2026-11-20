import { fireEvent, screen } from '@testing-library/react-native';

import { renderThemed, SCHEMES } from '../../../../test/render';

import { WaterCard } from '../components/WaterCard';
import { formatLogTime, waterGlasses } from '../logic/water';

describe('water helpers', () => {
  it('glasses: filled whole glasses, capped at the goal', () => {
    expect(waterGlasses(600, 2000)).toEqual({ filled: 2, goal: 8, goalMl: 2000 });
    expect(waterGlasses(9000, 2000).filled).toBe(8);
    expect(waterGlasses(-5).filled).toBe(0);
  });

  it('log time follows the locale (12 h in en-US, 24 h in en-GB)', () => {
    const at = new Date(2026, 10, 19, 13, 5).getTime();
    expect(formatLogTime(at, 'en-US')).toMatch(/1:05\s?PM/);
    expect(formatLogTime(at, 'en-GB')).toBe('13:05');
  });
});

describe.each(SCHEMES)('WaterCard (%s)', (scheme) => {
  it('shows the total, a visible +250 ml button and opens the log', async () => {
    const onAdd = jest.fn();
    const onOpen = jest.fn();
    await renderThemed(<WaterCard totalMl={750} goalMl={2000} onAdd={onAdd} onOpen={onOpen} />, scheme);
    expect(screen.getByTestId('water-total')).toHaveTextContent('750 ml of 2 L');
    await fireEvent.press(screen.getByRole('button', { name: 'Add 250 millilitres of water' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('open-water'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('without onOpen the summary is not a button', async () => {
    await renderThemed(<WaterCard totalMl={0} goalMl={2000} onAdd={jest.fn()} />, scheme);
    expect(screen.queryByTestId('open-water')).toBeNull();
    expect(screen.getByTestId('add-water')).toBeTruthy();
  });
});
