import {
  backoffMs,
  dequeue,
  dueItems,
  enqueue,
  markFailed,
  MAX_BACKOFF_MS,
  parseQueue,
  verifyBody,
} from '../logic/queue';

const ios = {
  platform: 'ios' as const,
  productId: 'com.client.repwise.pro.yearly',
  transactionId: '1',
  token: 'jws',
};
const android = {
  platform: 'android' as const,
  productId: 'repwise_pro',
  transactionId: 'GPA.1',
  token: 'tok',
};

describe('pending purchase queue', () => {
  it('dedupes by transaction (iOS) / token (Android)', () => {
    let q = enqueue([], ios, 0);
    q = enqueue(q, { ...ios, token: 'jws2' }, 5);
    q = enqueue(q, android, 10);
    expect(q.map((x) => x.key)).toEqual(['ios:1', 'android:tok']);
    expect(q[0]!.token).toBe('jws2');
  });

  it('backs off exponentially, capped at an hour', () => {
    expect([1, 2, 3].map(backoffMs)).toEqual([5_000, 10_000, 20_000]);
    expect(backoffMs(50)).toBe(MAX_BACKOFF_MS);
    const q = markFailed(enqueue([], ios, 0), 'ios:1', 100, 'offline');
    expect(q[0]).toMatchObject({ attempts: 1, nextAttemptAt: 5_100, lastError: 'offline' });
    expect(dueItems(q, 1_000)).toEqual([]);
    expect(dueItems(q, 1_000, true)).toHaveLength(1);
    expect(dueItems(q, 6_000)).toHaveLength(1);
    expect(dequeue(q, 'ios:1')).toEqual([]);
  });

  it('builds the per-platform /billing/verify body', () => {
    expect(verifyBody(ios)).toEqual({ platform: 'ios', signedTransaction: 'jws' });
    expect(verifyBody(android)).toEqual({
      platform: 'android',
      purchaseToken: 'tok',
      productId: 'repwise_pro',
    });
  });

  it('parses persisted queues defensively', () => {
    const q = enqueue([], android, 1);
    expect(parseQueue(JSON.stringify(q))).toEqual(q);
    expect(parseQueue('nope')).toEqual([]);
    expect(parseQueue(JSON.stringify([{ bad: 1 }]))).toEqual([]);
  });
});
