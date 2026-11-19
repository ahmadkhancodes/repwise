import { Platform } from 'react-native';

import { parseTrainLink, resolveTrainLink, trainHref } from '../logic/deepLink';

describe(`train deep link (${Platform.OS})`, () => {
  describe('parseTrainLink', () => {
    it('reads sessionId and start=1', () => {
      expect(parseTrainLink({ sessionId: 's1', start: '1' })).toEqual({ sessionId: 's1', start: true });
      expect(parseTrainLink({ sessionId: 's1', start: 'true' })).toEqual({ sessionId: 's1', start: true });
    });
    it('treats a missing or other start value as open-only', () => {
      expect(parseTrainLink({ sessionId: 's1' })).toEqual({ sessionId: 's1', start: false });
      expect(parseTrainLink({ sessionId: 's1', start: '0' })).toEqual({ sessionId: 's1', start: false });
    });
    it('takes the first value of repeated params and trims', () => {
      expect(parseTrainLink({ sessionId: [' s2 ', 's3'], start: ['1'] })).toEqual({ sessionId: 's2', start: true });
    });
    it('returns null without a session id', () => {
      expect(parseTrainLink({})).toBeNull();
      expect(parseTrainLink({ sessionId: '', start: '1' })).toBeNull();
      expect(parseTrainLink({ sessionId: [] })).toBeNull();
    });
  });

  describe('resolveTrainLink', () => {
    const start = { sessionId: 's1', start: true };
    const open = { sessionId: 's1', start: false };

    it('reports a missing or deleted session', () => {
      expect(resolveTrainLink(start, undefined)).toEqual({ kind: 'missing' });
      expect(resolveTrainLink(start, { id: 's1', status: 'planned', deletedAt: 5 })).toEqual({ kind: 'missing' });
    });
    it('starts a planned or skipped session', () => {
      for (const status of ['planned', 'skipped', null]) {
        expect(resolveTrainLink(start, { id: 's1', status })).toEqual({ kind: 'open', sessionId: 's1', route: '/workout/s1', run: 'start' });
      }
    });
    it('resumes a paused session and just opens an active one', () => {
      expect(resolveTrainLink(start, { id: 's1', status: 'paused' }, 's1')).toMatchObject({ run: 'resume' });
      expect(resolveTrainLink(start, { id: 's1', status: 'active' }, 's1')).toMatchObject({ kind: 'open', run: null });
    });
    it('opens a finished session on its summary', () => {
      expect(resolveTrainLink(start, { id: 's1', status: 'done' })).toEqual({ kind: 'summary', sessionId: 's1', route: '/workout/s1/summary' });
    });
    it('never starts a second workout while another is in progress', () => {
      expect(resolveTrainLink(start, { id: 's1', status: 'planned' }, 'other')).toMatchObject({ kind: 'open', run: null });
    });
    it('without start=1 only opens', () => {
      expect(resolveTrainLink(open, { id: 's1', status: 'planned' })).toEqual({ kind: 'open', sessionId: 's1', route: '/workout/s1', run: null });
    });
  });
});

describe('trainHref', () => {
  it('builds the link parseTrainLink reads back', () => {
    expect(trainHref('s1')).toBe('/train?sessionId=s1&start=1');
    expect(trainHref('s1', false)).toBe('/train?sessionId=s1');
    const q = new URLSearchParams(trainHref('a b/c').split('?')[1]);
    expect(parseTrainLink({ sessionId: q.get('sessionId') ?? undefined, start: q.get('start') ?? undefined })).toEqual({
      sessionId: 'a b/c',
      start: true,
    });
  });
});
