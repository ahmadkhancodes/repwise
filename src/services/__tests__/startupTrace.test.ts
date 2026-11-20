import {
  formatStartup,
  markFirstFrame,
  markStartup,
  resetStartupTraceForTests,
  startupMarks,
  timeToFirstScreen,
} from '../startupTrace';

describe('startup trace (dev only)', () => {
  it('records marks once each and logs one line at the first frame', async () => {
    const lines: string[] = [];
    resetStartupTraceForTests({ enabled: true, log: (l) => lines.push(l) });
    markStartup('layout', 100);
    markStartup('layout', 999); // first call wins
    markStartup('fonts', 102);
    markStartup('db', 110);
    expect(timeToFirstScreen()).toBeNull();
    markFirstFrame();
    markFirstFrame(); // logs once
    await new Promise((r) => setTimeout(r, 30));
    expect(startupMarks().map((m) => m.name)).toEqual(['layout', 'fonts', 'db', 'first_frame']);
    expect(timeToFirstScreen()).not.toBeNull();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(
      /^\[startup\] first screen \d+ ms after runtime start · layout \+0 · fonts \+2 · db \+10 · first_frame \+/,
    );
    markStartup('late', 5000); // ignored once reported
    expect(startupMarks()).toHaveLength(4);
  });

  it('is a no-op when disabled (release builds)', async () => {
    const lines: string[] = [];
    resetStartupTraceForTests({ enabled: false, log: (l) => lines.push(l) });
    markStartup('layout');
    markFirstFrame();
    await new Promise((r) => setTimeout(r, 30));
    expect(startupMarks()).toEqual([]);
    expect(lines).toEqual([]);
  });

  it('formats nothing until the first frame', () => {
    expect(formatStartup([{ name: 'layout', at: 1 }])).toBeNull();
    expect(
      formatStartup([
        { name: 'db', at: 5 },
        { name: 'first_frame', at: 40 },
      ]),
    ).toBe('[startup] first screen 40 ms after runtime start · db +0 · first_frame +35');
  });
});
