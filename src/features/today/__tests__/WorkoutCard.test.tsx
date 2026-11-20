import { fireEvent, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { renderThemed, SCHEMES } from '../../../../test/render';
import { Text } from '@/ui';

import { WorkoutCard } from '../components/WorkoutCard';

const workout = {
  sessionId: 's1',
  title: 'Upper A',
  minutes: 52,
  exercises: 5,
  muscles: ['Chest', 'Back'],
  status: 'planned' as const,
  done: false,
  inProgress: false,
};

describe.each(SCHEMES)(`Today WorkoutCard (%s, ${Platform.OS})`, (scheme) => {
  it('Today: one primary action, Start workout', async () => {
    const onStart = jest.fn();
    await renderThemed(
      <WorkoutCard workout={workout} onStart={onStart} onOpen={jest.fn()} />,
      scheme,
    );
    await fireEvent.press(screen.getByTestId('start-workout'));
    expect(onStart).toHaveBeenCalled();
  });

  it('reveal preview: the same card with no action and an optional detail slot (P2-10)', async () => {
    await renderThemed(
      <WorkoutCard
        workout={workout}
        preview
        detail={<Text>1 Bench press</Text>}
        testID="reveal-workout"
      />,
      scheme,
    );
    expect(screen.getByTestId('reveal-workout')).toBeTruthy();
    expect(screen.getByTestId('workout-title')).toHaveTextContent('Upper A');
    expect(screen.getByText('1 Bench press')).toBeTruthy();
    expect(screen.queryByTestId('start-workout')).toBeNull();
  });
});
