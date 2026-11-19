import { ctaLabel, DEFAULT_PLAN, formatMoney, perWeek, PLANS, priceLine } from '../plans';

describe('plans', () => {
  it('matches the approved ladder, yearly first and pre-selected, weekly last', () => {
    expect(PLANS.map((p) => p.id)).toEqual(['yearly', 'quarterly', 'monthly', 'weekly']);
    expect(PLANS.map((p) => p.price)).toEqual(['$59.99', '$24.99', '$12.99', '$4.99']);
    expect(DEFAULT_PLAN).toBe('yearly');
    expect(PLANS.filter((p) => p.trialDays > 0).map((p) => p.id)).toEqual(['yearly']);
  });

  it('per-week equivalents match sheet 05', () => {
    expect(perWeek('yearly', 59.99, 'USD')).toBe('$1.15');
    expect(perWeek('quarterly', 24.99, 'USD')).toBe('$1.92');
    expect(perWeek('monthly', 12.99, 'USD')).toBe('$3.00');
    expect(perWeek('yearly', null, 'USD')).toBeNull();
  });

  it('formats other currencies and survives an unknown code', () => {
    expect(formatMoney(45.99, 'GBP')).toBe('£45.99');
    expect(formatMoney(1.5, 'NOT_A_CODE')).toBe('NOT_A_CODE 1.50');
  });

  it('states the price after the trial in plain words', () => {
    expect(priceLine({ plan: 'yearly', price: '$59.99', trialDays: 7, perWeek: '$1.15' })).toBe(
      '7 days free, then $59.99/year ($1.15/week). Cancel anytime.',
    );
    expect(ctaLabel(7)).toBe('Start free trial');
  });

  it('plans without a trial say so plainly', () => {
    expect(priceLine({ plan: 'weekly', price: '$4.99', trialDays: 0, perWeek: '$4.99' })).toBe(
      '$4.99/week, renews automatically. Cancel anytime.',
    );
    expect(ctaLabel(0)).toBe('Continue');
  });

  it('uses the localised store price', () => {
    expect(priceLine({ plan: 'yearly', price: '£45.99', trialDays: 7, perWeek: '£0.88' })).toBe(
      '7 days free, then £45.99/year (£0.88/week). Cancel anytime.',
    );
  });
});
