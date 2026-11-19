/** Pure helpers for the Backup & account screen (S39/S40). */
import { isApiError } from '@/services/api';

/** "Last backup" line. Pure: `now` and `at` are ms epochs. */
export function backupLabel(at: number | null, now: number): string {
  if (at === null) return 'Not backed up yet';
  const min = Math.floor((now - at) / 60_000);
  if (min < 1) return 'Backed up just now';
  if (min < 60) return `Backed up ${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Backed up ${h} h ago`;
  const d = Math.floor(h / 24);
  return `Backed up ${d} ${d === 1 ? 'day' : 'days'} ago`;
}

export function providerLabel(p: 'apple' | 'google' | 'email' | null): string {
  switch (p) {
    case 'apple':
      return 'Signed in with Apple';
    case 'google':
      return 'Signed in with Google';
    case 'email':
      return 'Signed in with email';
    default:
      return 'Signed in';
  }
}

/** Plain-language message for any auth/backup error (never a raw code). */
export function errorMessage(e: unknown): string {
  if (e instanceof Error && !isApiError(e)) {
    if (e.message === 'invalid_email') return 'Enter a valid email address.';
    if (e.message === 'invalid_code') return 'Enter the 6-digit code from the email.';
  }
  if (!isApiError(e)) return 'Something went wrong. Try again.';
  switch (e.kind) {
    case 'offline':
      return "You're offline. Try again when you're connected.";
    case 'timeout':
      return 'The server took too long. Try again.';
    case 'config':
      return "Backup isn't available in this build yet.";
    default:
      break;
  }
  switch (e.code) {
    case 'invalid_code':
      return "That code isn't right. Check the email and try again.";
    case 'too_many_attempts':
      return 'Too many wrong codes. Ask for a new one.';
    case 'rate_limited':
      return 'Too many tries. Wait a few minutes and try again.';
    case 'account_conflict':
      return 'This sign-in is already linked to another account.';
    case 'invalid_email':
      return 'Enter a valid email address.';
    case 'session_expired':
      return 'Your session ended. Sign in again.';
    default:
      return 'Something went wrong. Try again.';
  }
}
