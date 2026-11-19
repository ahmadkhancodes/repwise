import { setAnalyticsSink, track } from '../analytics';

afterEach(() => setAnalyticsSink(null));

it('forwards events to the sink and never throws', () => {
  const sink = jest.fn();
  setAnalyticsSink(sink);
  track('workout_started', { source: 'plan' });
  expect(sink).toHaveBeenCalledWith('workout_started', { source: 'plan' });
  setAnalyticsSink(() => {
    throw new Error('boom');
  });
  expect(() => track('x')).not.toThrow();
  setAnalyticsSink(null);
  expect(() => track('y')).not.toThrow();
});
