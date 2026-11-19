import { ctaLabel, DEFAULT_PLAN, PLANS, priceLine } from '../plans';

describe('plans', () => {
  it('matches the approved ladder with yearly pre-selected', () => {
    expect(PLANS.map((p) => p.price)).toEqual(['$4.99', '$12.99', '$24.99', '$59.99']);
    expect(DEFAULT_PLAN).toBe('yearly');
  });
  it('states the price after the trial in plain words', () => {
    const yearly = PLANS.find((p) => p.id === 'yearly')!;
    expect(priceLine(yearly)).toBe('7 days free, then $59.99/year. Cancel anytime.');
    expect(ctaLabel(yearly)).toBe('Start free trial');
  });
  it('plans without a trial say so plainly', () => {
    const weekly = PLANS.find((p) => p.id === 'weekly')!;
    expect(priceLine(weekly)).toBe('$4.99/week. Cancel anytime.');
    expect(ctaLabel(weekly)).toBe('Continue');
  });
});
