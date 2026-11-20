import { fireEvent, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { WeekdayPicker } from '@/features/onboarding/components/WeekdayPicker';

import { renderThemed, SCHEMES } from '../../../../test/render';
import { TimeSheet } from '../components/TimeSheet';
import { ToggleRow } from '../components/ToggleRow';

describe.each(SCHEMES)(`ToggleRow (%s, ${Platform.OS})`, (scheme) => {
  it('whole row is the switch by default', async () => {
    const onChange = jest.fn();
    await renderThemed(<ToggleRow title="Quiet" value onChange={onChange} testID="t" />, scheme);
    const sw = screen.getByRole('switch', { name: 'Quiet' });
    expect(sw.props.accessibilityState.checked).toBe(true);
    await fireEvent.press(sw);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('with a detail action: text opens it, switch toggles (no nesting)', async () => {
    const onChange = jest.fn();
    const onDetail = jest.fn();
    await renderThemed(
      <ToggleRow
        title="Morning brief"
        subtitle="7:15 AM"
        value={false}
        onChange={onChange}
        onPressDetail={onDetail}
        detailTestID="time-brief"
        testID="toggle-brief"
      />,
      scheme,
    );
    await fireEvent.press(screen.getByTestId('time-brief'));
    expect(onDetail).toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('switch', { name: 'Morning brief' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('locked shows a Pro badge and opens the paywall', async () => {
    const onLocked = jest.fn();
    await renderThemed(
      <ToggleRow title="Meals" value onChange={jest.fn()} locked="Pro" onLockedPress={onLocked} testID="m" />,
      scheme,
    );
    expect(screen.getByText('Pro')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('m'));
    expect(onLocked).toHaveBeenCalled();
  });
});

describe(`TimeSheet (${Platform.OS})`, () => {
  it('12-hour phones get 12,1…11 and AM/PM; saving keeps 24-hour storage', async () => {
    const onSave = jest.fn();
    await renderThemed(
      <TimeSheet
        twelveHour
        target={{ type: 'time', title: 'Lunch', value: '13:00', onSave }}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByTestId('pick-meridiem')).toBeTruthy();
    await fireEvent(screen.getByTestId('pick-meridiem'), 'accessibilityAction', {
      nativeEvent: { actionName: 'decrement' },
    });
    await fireEvent.press(screen.getByTestId('time-save'));
    expect(onSave).toHaveBeenCalledWith('01:00');
  });

  it('24-hour phones get 00–23 and no AM/PM', async () => {
    const onSave = jest.fn();
    await renderThemed(
      <TimeSheet
        twelveHour={false}
        target={{ type: 'time', title: 'Lunch', value: '13:00', onSave }}
        onClose={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('pick-meridiem')).toBeNull();
    await fireEvent(screen.getByTestId('pick-hour'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    await fireEvent.press(screen.getByTestId('time-save'));
    expect(onSave).toHaveBeenCalledWith('14:00');
  });

  it('weekday + time in one sheet', async () => {
    const onSave = jest.fn();
    await renderThemed(
      <TimeSheet
        twelveHour={false}
        target={{ type: 'weekdayTime', title: 'Check-in', value: { day: 0, time: '18:00' }, onSave }}
        onClose={jest.fn()}
      />,
    );
    await fireEvent(screen.getByTestId('pick-day'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    await fireEvent.press(screen.getByTestId('time-save'));
    expect(onSave).toHaveBeenCalledWith({ day: 1, time: '18:00' });
  });
});

describe.each(SCHEMES)(`WeekdayPicker (%s, ${Platform.OS})`, (scheme) => {
  it('seven flex cells (no fixed widths), checkbox roles, today in the label', async () => {
    const onToggle = jest.fn();
    await renderThemed(
      <WeekdayPicker selected={[0, 2]} today={2} onToggle={onToggle} testID="wd" />,
      scheme,
    );
    for (let i = 0; i < 7; i++) {
      const cell = screen.getByTestId(`wd-${i}`);
      const style = Object.assign({}, ...[cell.props.style].flat(3).filter(Boolean)) as Record<string, unknown>;
      expect(style.flex).toBe(1);
      expect(style.width).toBeUndefined();
    }
    expect(screen.getByRole('checkbox', { name: 'Wednesday, today' }).props.accessibilityState.checked).toBe(true);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Sunday' }));
    expect(onToggle).toHaveBeenCalledWith(6);
  });
});
