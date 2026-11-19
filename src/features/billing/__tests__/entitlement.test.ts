import { cachedProActive, needsRefresh, parseCached, toCached } from '../logic/entitlement';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 19);
const ent = (over = {}) => ({
  pro: true,
  plan: 'monthly' as const,
  source: 'apple' as const,
  expiresAt: NOW + 10 * DAY,
  inTrial: false,
  autoRenew: true,
  updatedAt: NOW,
  ...over,
});

describe('entitlement cache', () => {
  it('Pro while the period is active', () => {
    expect(cachedProActive(toCached(ent(), NOW), NOW)).toBe(true);
  });

  it('never Pro without a Worker entitlement', () => {
    expect(cachedProActive(null, NOW)).toBe(false);
    expect(cachedProActive(toCached(ent({ pro: false }), NOW), NOW)).toBe(false);
    expect(cachedProActive(toCached(ent({ expiresAt: null }), NOW), NOW)).toBe(false);
  });

  it('offline grace: 3 days past expiry, then off', () => {
    const c = toCached(ent({ expiresAt: NOW + DAY }), NOW);
    expect(cachedProActive(c, NOW + 3 * DAY)).toBe(true);
    expect(cachedProActive(c, NOW + 4 * DAY + 1)).toBe(false);
  });

  it('a cache older than 30 days no longer unlocks Pro', () => {
    const c = toCached(ent({ expiresAt: NOW + 365 * DAY }), NOW);
    expect(cachedProActive(c, NOW + 29 * DAY)).toBe(true);
    expect(cachedProActive(c, NOW + 31 * DAY)).toBe(false);
  });

  it('refreshes when stale or past expiry', () => {
    expect(needsRefresh(null, NOW)).toBe(true);
    const c = toCached(ent(), NOW);
    expect(needsRefresh(c, NOW + 60_000)).toBe(false);
    expect(needsRefresh(c, NOW + 7 * 3_600_000)).toBe(true);
    expect(needsRefresh(toCached(ent({ expiresAt: NOW + 1000 }), NOW), NOW + 2000)).toBe(true);
  });

  it('parses only well-formed cache', () => {
    const c = toCached(ent(), NOW);
    expect(parseCached(JSON.stringify(c))).toEqual(c);
    expect(parseCached('{nope')).toBeNull();
    expect(parseCached(JSON.stringify({ pro: 'yes' }))).toBeNull();
    expect(parseCached(undefined)).toBeNull();
  });
});
