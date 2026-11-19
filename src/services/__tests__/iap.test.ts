import { Platform } from 'react-native';

import {
  classifyStoreError,
  createIapAdapter,
  normalizePurchase,
  subscriptionRequestProps,
} from '@/services/iap';

const mockIap = {
  initConnection: jest.fn(async () => true),
  endConnection: jest.fn(async () => true),
  fetchProducts: jest.fn(async () => []),
  isEligibleForIntroOfferIOS: jest.fn(async () => true),
  requestPurchase: jest.fn(async () => null),
  finishTransaction: jest.fn(async () => undefined),
  restorePurchases: jest.fn(async () => undefined),
  getAvailablePurchases: jest.fn(async () => [] as unknown[]),
  getTransactionJwsIOS: jest.fn(async () => 'jws-from-lookup'),
  purchaseUpdatedListener: jest.fn(() => ({ remove: jest.fn() })),
  purchaseErrorListener: jest.fn(() => ({ remove: jest.fn() })),
};
jest.mock('react-native-iap', () => mockIap);

const os = Platform.OS === 'ios' ? 'ios' : 'android';
const ACCOUNT = '0196A0B2-7C1D-7E3F-8A4B-123456789ABC';

beforeEach(() => jest.clearAllMocks());

describe(`react-native-iap adapter (${Platform.OS})`, () => {
  it('requests a subscription with the platform-specific shape', async () => {
    const a = createIapAdapter();
    expect(a.platform).toBe(os);
    await a.requestSubscription({
      sku: os === 'ios' ? 'com.client.repwise.pro.yearly' : 'repwise_pro',
      offerToken: 'tok',
      accountId: ACCOUNT,
    });
    const arg = (mockIap.requestPurchase.mock.calls[0] as unknown as [unknown])[0];
    if (os === 'ios') {
      expect(arg).toEqual({
        type: 'subs',
        request: {
          apple: {
            sku: 'com.client.repwise.pro.yearly',
            appAccountToken: ACCOUNT.toLowerCase(),
            andDangerouslyFinishTransactionAutomatically: false,
          },
        },
      });
    } else {
      expect(arg).toEqual({
        type: 'subs',
        request: {
          google: {
            skus: ['repwise_pro'],
            subscriptionOffers: [{ sku: 'repwise_pro', offerToken: 'tok' }],
            obfuscatedAccountId: ACCOUNT,
          },
        },
      });
    }
  });

  it('iOS only sends a UUID appAccountToken', () => {
    expect(subscriptionRequestProps('ios', { sku: 'x', accountId: 'not-a-uuid' })).toEqual({
      apple: { sku: 'x', andDangerouslyFinishTransactionAutomatically: false },
    });
  });

  it('finishes with the transaction id (iOS) / purchase token (Android), never consumable', async () => {
    const a = createIapAdapter();
    await a.finish({
      platform: os,
      productId: 'p',
      transactionId: 'tx1',
      token: 'tok1',
      state: 'purchased',
    });
    const arg = (
      mockIap.finishTransaction.mock.calls[0] as unknown as [
        { purchase: Record<string, unknown>; isConsumable: boolean },
      ]
    )[0];
    expect(arg.isConsumable).toBe(false);
    expect(arg.purchase.id).toBe('tx1');
    if (os === 'android') expect(arg.purchase.purchaseToken).toBe('tok1');
    else expect(arg.purchase.purchaseToken).toBeUndefined();
  });

  it('restore syncs with the App Store first on iOS only', async () => {
    mockIap.getAvailablePurchases.mockResolvedValueOnce([
      {
        id: 'tx9',
        productId: 'p',
        purchaseState: 'purchased',
        purchaseToken: os === 'ios' ? null : 'tok9',
        isAcknowledgedAndroid: true,
      },
    ]);
    const list = await createIapAdapter().getAvailablePurchases({ sync: true });
    expect(mockIap.restorePurchases).toHaveBeenCalledTimes(os === 'ios' ? 1 : 0);
    // iOS: missing JWS is looked up per product.
    expect(list[0]!.token).toBe(os === 'ios' ? 'jws-from-lookup' : 'tok9');
  });

  it('intro eligibility asks StoreKit on iOS; Play pre-filters offers', async () => {
    const eligible = await createIapAdapter().introEligible([
      { id: 'p', platform: 'ios', subscriptionGroupIdIOS: 'g1' } as never,
    ]);
    expect(eligible).toBe(true);
    expect(mockIap.isEligibleForIntroOfferIOS).toHaveBeenCalledTimes(os === 'ios' ? 1 : 0);
  });

  it('normalises purchases and errors', () => {
    const p = normalizePurchase(
      {
        id: 'tx',
        productId: 'p',
        purchaseState: 'pending',
        purchaseToken: 't',
        isAcknowledgedAndroid: false,
      } as never,
      'android',
    );
    expect(p).toMatchObject({ state: 'pending', acknowledged: false, token: 't' });
    expect(classifyStoreError({ code: 'user-cancelled' }).kind).toBe('cancelled');
    expect(classifyStoreError({ code: 'deferred-payment' }).kind).toBe('pending');
    expect(classifyStoreError({ code: 'already-owned', productId: 'x' })).toMatchObject({
      kind: 'already_owned',
      productId: 'x',
    });
    expect(classifyStoreError(new Error('boom')).kind).toBe('other');
  });
});
