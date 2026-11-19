import { fireEvent, screen } from '@testing-library/react-native';

import { colors } from '@/theme';

import { flat, renderThemed, SCHEMES } from '../../../test/render';
import { weekDayLabel, WeekStrip, type WeekDay } from '../WeekStrip';

const NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAYS: WeekDay[] = NAMES.map((weekday, i) => ({
  key: `2026-11-${16 + i}`,
  weekday,
  day: 16 + i,
  status: i < 2 ? 'done' : i === 2 ? 'missed' : i === 6 ? 'rest' : 'planned',
  locked: i === 6,
}));

describe('weekDayLabel', () => {
  it('builds a spoken label', () => {
    expect(weekDayLabel(DAYS[0]!, false)).toBe('Mon 16, done');
    expect(weekDayLabel(DAYS[3]!, true)).toBe('Thu 19, today, planned');
    expect(weekDayLabel(DAYS[6]!, false)).toBe('Sun 22, rest day, Pro');
    expect(
      weekDayLabel({ key: 'x', weekday: 'Mon', day: 1, accessibilityLabel: 'Custom' }, true),
    ).toBe('Custom');
  });
});

describe.each(SCHEMES)('WeekStrip (%s)', (scheme) => {
  it('renders 7 flexible tabs and selects a day', async () => {
    const onSelect = jest.fn();
    await renderThemed(
      <WeekStrip
        days={DAYS}
        selectedKey="2026-11-19"
        todayKey="2026-11-19"
        onSelect={onSelect}
        testID="ws"
      />,
      scheme,
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(7);
    for (const tab of tabs) {
      const s = flat(tab.props.style);
      // Flex, not fixed widths: fits 360dp at 130% font.
      expect(s.flex).toBe(1);
      expect(s.minWidth).toBe(0);
      expect(s.width).toBeUndefined();
    }
    const today = screen.getByRole('tab', { name: 'Thu 19, today, planned' });
    expect(today).toBeSelected();
    expect(flat(today.props.style).backgroundColor).toBe(colors[scheme].inverse);
    await fireEvent.press(screen.getByRole('tab', { name: 'Fri 20, planned' }));
    expect(onSelect).toHaveBeenCalledWith('2026-11-20');
  });

  it('done days show a check instead of the number', async () => {
    await renderThemed(<WeekStrip days={DAYS} selectedKey={null} onSelect={jest.fn()} />, scheme);
    expect(screen.queryByText('16')).toBeNull();
    expect(screen.getByText('19')).toBeTruthy();
  });
});
