const mockInitAuth = jest.fn(() => Promise.resolve());
const mockInit = jest.fn(() => Promise.resolve());
const mockConfigure = jest.fn(() => ({ init: mockInit }));
const mockStartSync = jest.fn();
const mockWarm = jest.fn();
const mockBridge = jest.fn();
const mockKeeper = jest.fn();

jest.mock('../auth', () => ({ initAuth: () => mockInitAuth() }));
jest.mock('../billing', () => ({ configureBilling: () => mockConfigure() }));
jest.mock('../billingApi', () => ({ createWorkerBillingApi: () => ({}) }));
jest.mock('../billingSession', () => ({ linkBillingToSession: jest.fn() }));
jest.mock('../catalog', () => ({ warmCatalog: () => mockWarm() }));
jest.mock('@/sync', () => ({ startSync: () => mockStartSync() }));
jest.mock('@/features/planner/bridge', () => ({
  registerPlannerBridge: () => mockBridge(),
  startPlanKeeper: () => mockKeeper(),
}));

// eslint-disable-next-line import/first -- the mocks above must be declared before the import
import { BACKGROUND_DELAY_MS, resetBootstrapForTests, startBackgroundServices } from '../bootstrap';

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  resetBootstrapForTests();
});
afterEach(() => jest.useRealTimers());

it('restores auth now, the planner after the first frame, billing, sync and the catalogue after the first screen', async () => {
  startBackgroundServices();
  expect(mockInitAuth).toHaveBeenCalledTimes(1);
  // The planner module (engine + zod) is not evaluated before the first frame (perf r2 N1).
  expect(mockBridge).not.toHaveBeenCalled();
  expect(mockKeeper).not.toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(50);
  expect(mockBridge).toHaveBeenCalledTimes(1);
  expect(mockKeeper).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(BACKGROUND_DELAY_MS - 51);
  expect(mockConfigure).not.toHaveBeenCalled();
  expect(mockStartSync).not.toHaveBeenCalled();
  expect(mockWarm).not.toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(1);
  expect(mockWarm).toHaveBeenCalledTimes(1);
  expect(mockConfigure).toHaveBeenCalledTimes(1);
  expect(mockInit).toHaveBeenCalledTimes(1);
  expect(mockStartSync).toHaveBeenCalledTimes(1);
});

it('starts once', async () => {
  startBackgroundServices(10);
  startBackgroundServices(10);
  await jest.advanceTimersByTimeAsync(20);
  expect(mockInitAuth).toHaveBeenCalledTimes(1);
  expect(mockStartSync).toHaveBeenCalledTimes(1);
});

it('a throwing planner start never breaks the other services', async () => {
  mockBridge.mockImplementationOnce(() => {
    throw new Error('engine');
  });
  startBackgroundServices(100);
  await jest.advanceTimersByTimeAsync(150);
  expect(mockStartSync).toHaveBeenCalledTimes(1);
});

it('a failing auth restore still starts billing and sync', async () => {
  mockInitAuth.mockImplementationOnce(() => Promise.reject(new Error('keychain')));
  startBackgroundServices(5);
  await jest.advanceTimersByTimeAsync(10);
  expect(mockStartSync).toHaveBeenCalledTimes(1);
});
