import { DEFAULT_PAYWALL_HEADLINE, paywallHeadline } from '../logic/headline';

describe('paywallHeadline (UI audit N7)', () => {
  it('says "Your plan is ready" only after onboarding, with the name when known', () => {
    expect(paywallHeadline('onboarding')).toBe('Your plan is ready.');
    expect(paywallHeadline('onboarding', 'Sara')).toBe('Your plan is ready, Sara.');
    expect(paywallHeadline('eat_week', 'Sara')).toBe('Plan the whole week.');
  });
  it('names what each gate unlocks; unknown sources get the generic line', () => {
    expect(paywallHeadline('grocery')).toBe('Your grocery list, done.');
    expect(paywallHeadline('gate:routines')).toBe('Build every routine you want.');
    expect(paywallHeadline(undefined)).toBe(DEFAULT_PAYWALL_HEADLINE);
    expect(paywallHeadline('nope')).toBe(DEFAULT_PAYWALL_HEADLINE);
  });
});
