import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { resetDbForTests } from '@/db/client';
import { migrateDb } from '@/db/migrate';
import { useToastStore } from '@/ui';

import { renderThemed, SCHEMES } from '../../../../test/render';
import { getProfile, saveProfile } from '../repo';
import { ProfileScreen } from '../screens/ProfileScreen';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
}));

function seed() {
  saveProfile({
    goal: 'fat_loss',
    sex: 'male',
    birthYear: 1992,
    heightCm: 180,
    weightKg: 85,
    targetKg: 78,
    experience: 'intermediate',
    days: 3,
    sessionMin: 60,
    equipment: ['bodyweight', 'barbell', 'dumbbell', 'bench'],
  });
}

beforeEach(async () => {
  resetDbForTests();
  await migrateDb();
  jest.clearAllMocks();
});

describe.each(SCHEMES)(`ProfileScreen (%s, ${Platform.OS})`, (scheme) => {
  it('shows the saved plan with Save disabled until something changes', async () => {
    seed();
    await renderThemed(<ProfileScreen replan={jest.fn()} />, scheme);
    expect(await screen.findByTestId('screen-profile')).toBeTruthy();
    expect(screen.getByTestId('goal-fat_loss')).toBeSelected();
    expect(screen.getByTestId('length-60')).toBeSelected();
    expect(screen.getByTestId('location-gym')).toBeSelected();
    expect(screen.getByTestId('profile-save')).toBeDisabled();
    expect(screen.getByText('No changes')).toBeTruthy();
  });
});

describe(`ProfileScreen edits (${Platform.OS})`, () => {
  it('empty: no profile yet → set up', async () => {
    await renderThemed(<ProfileScreen replan={jest.fn()} />);
    expect(await screen.findByTestId('profile-empty')).toBeTruthy();
    await fireEvent.press(screen.getByText('Set up my plan'));
    expect(router.replace).toHaveBeenCalledWith('/welcome');
  });

  it('saving writes the profile and replans with the picked weekdays', async () => {
    seed();
    const replan = jest.fn(async () => undefined);
    await renderThemed(<ProfileScreen replan={replan} />);
    await fireEvent.press(await screen.findByTestId('goal-maintain'));
    await fireEvent.press(screen.getByTestId('length-45'));
    await fireEvent.press(screen.getByTestId('location-home'));
    await fireEvent.press(screen.getByTestId('profile-save'));
    await waitFor(() => expect(replan).toHaveBeenCalledTimes(1));
    const p = getProfile()!;
    expect(p.goal).toBe('maintain');
    expect(p.targetKg).toBeNull();
    expect(p.sessionMin).toBe(45);
    expect(p.equipment).toEqual(['bodyweight', 'dumbbell', 'bench', 'band', 'mat']);
    expect((replan.mock.calls[0] as unknown as [number[]])[0]).toHaveLength(3);
    expect(useToastStore.getState().current?.message).toBe('Plan updated from today.');
    expect(router.back).toHaveBeenCalled();
  });

  it('validation: the number of picked days must match', async () => {
    seed();
    const replan = jest.fn(async () => undefined);
    await renderThemed(<ProfileScreen replan={replan} />);
    const picker = await screen.findByTestId('profile-weekday');
    const selected = [0, 1, 2, 3, 4, 5, 6].find(
      (d) => screen.getByTestId(`profile-weekday-${d}`).props.accessibilityState.checked,
    )!;
    expect(picker).toBeTruthy();
    await fireEvent.press(screen.getByTestId(`profile-weekday-${selected}`));
    await fireEvent.press(screen.getByTestId('profile-save'));
    expect(await screen.findByTestId('profile-error')).toHaveTextContent('Pick 3 training days (2 selected).');
    expect(replan).not.toHaveBeenCalled();
  });

  it('error: a failed replan says so and stays', async () => {
    seed();
    const replan = jest.fn(async () => {
      throw new Error('engine');
    });
    await renderThemed(<ProfileScreen replan={replan} />);
    await fireEvent.press(await screen.findByTestId('length-90'));
    await fireEvent.press(screen.getByTestId('profile-save'));
    expect(await screen.findByTestId('profile-error')).toHaveTextContent(/couldn't rebuild/);
    expect(router.back).not.toHaveBeenCalled();
  });
});
