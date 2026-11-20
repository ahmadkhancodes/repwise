/**
 * Help and legal destinations (S42). The texts live in docs/legal and are published on the
 * website; the app opens them in the browser. Override the site with EXPO_PUBLIC_WEBSITE_URL.
 */
import { LEGAL_URLS } from '@/features/billing/config';

export const SUPPORT_EMAIL = 'buffersoltechnologies@gmail.com';

/** Pure: the site's links, from an optional base URL (no trailing slash needed). */
export function helpLinks(base: string | undefined = process.env.EXPO_PUBLIC_WEBSITE_URL): {
  terms: string;
  privacy: string;
  deleteAccount: string;
  help: string;
} {
  const root = base?.trim().replace(/\/+$/, '');
  if (!root) {
    return {
      terms: LEGAL_URLS.terms,
      privacy: LEGAL_URLS.privacy,
      deleteAccount: 'https://repwise.app/delete-account',
      help: 'https://repwise.app/help',
    };
  }
  return {
    terms: `${root}/terms`,
    privacy: `${root}/privacy`,
    deleteAccount: `${root}/delete-account`,
    help: `${root}/help`,
  };
}

/** Pure: a support email with the app version and platform filled in (no personal data). */
export function supportMailto(version: string, platform: string): string {
  const subject = encodeURIComponent('Repwise help');
  const body = encodeURIComponent(`\n\n—\nRepwise ${version} · ${platform}`);
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}
