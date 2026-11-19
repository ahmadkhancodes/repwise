import { ApiError } from '@/services/api';

import { backupLabel, errorMessage, providerLabel } from '../logic/account';

describe('account logic', () => {
  it('backupLabel', () => {
    const now = 10 * 86_400_000;
    expect(backupLabel(null, now)).toBe('Not backed up yet');
    expect(backupLabel(now - 30_000, now)).toBe('Backed up just now');
    expect(backupLabel(now - 5 * 60_000, now)).toBe('Backed up 5 min ago');
    expect(backupLabel(now - 3 * 3_600_000, now)).toBe('Backed up 3 h ago');
    expect(backupLabel(now - 86_400_000, now)).toBe('Backed up 1 day ago');
    expect(backupLabel(now - 3 * 86_400_000, now)).toBe('Backed up 3 days ago');
  });

  it('providerLabel', () => {
    expect(providerLabel('apple')).toBe('Signed in with Apple');
    expect(providerLabel(null)).toBe('Signed in');
  });

  it('errorMessage never leaks codes', () => {
    expect(errorMessage(new ApiError('offline'))).toMatch(/offline/);
    expect(errorMessage(new ApiError('unauthorized', 401, 'invalid_code'))).toMatch(
      /code isn't right/,
    );
    expect(errorMessage(new ApiError('http', 429, 'rate_limited'))).toMatch(/Too many tries/);
    expect(errorMessage(new ApiError('http', 500, 'internal'))).toBe(
      'Something went wrong. Try again.',
    );
    expect(errorMessage(new Error('invalid_email'))).toBe('Enter a valid email address.');
    expect(errorMessage('weird')).toBe('Something went wrong. Try again.');
  });
});
