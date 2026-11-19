import { fireEvent, screen } from '@testing-library/react-native';
import { Inbox } from 'lucide-react-native';

import { colors } from '@/theme';

import { flat, renderThemed, SCHEMES } from '../../../test/render';
import { EmptyState } from '../EmptyState';

describe.each(SCHEMES)('EmptyState (%s)', (scheme) => {
  it('title + body only', async () => {
    await renderThemed(
      <EmptyState icon={Inbox} title="No workouts yet" body="Your history shows up here." />,
      scheme,
    );
    expect(screen.getByRole('header', { name: 'No workouts yet' })).toBeTruthy();
    expect(flat(screen.getByText('Your history shows up here.').props.style).color).toBe(
      colors[scheme].textSecondary,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('with an action', async () => {
    const onAction = jest.fn();
    await renderThemed(
      <EmptyState title="No results" actionLabel="Clear filters" onAction={onAction} />,
      scheme,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onAction).toHaveBeenCalled();
  });
});
