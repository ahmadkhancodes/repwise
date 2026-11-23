/**
 * Test doubles for the step sources (expo-sensors Pedometer, react-native-health-connect).
 * Default: pedometer available, permission undetermined, Health Connect not installed.
 * Tests change `stepsFake` to drive each path; `resetStepsFake()` runs before every test.
 */
type Perm = { granted: boolean; status: 'granted' | 'denied' | 'undetermined'; canAskAgain: boolean };

export const stepsFake = {
  available: true,
  perm: { granted: false, status: 'undetermined', canAskAgain: true } as Perm,
  grantOnRequest: true,
  steps: 0,
  watchers: [] as ((r: { steps: number }) => void)[],
  hcStatus: 1,
  hcGranted: false,
  hcGrantOnRequest: true,
  hcSteps: 0,
};

export function resetStepsFake(): void {
  Object.assign(stepsFake, {
    available: true,
    perm: { granted: false, status: 'undetermined', canAskAgain: true },
    grantOnRequest: true,
    steps: 0,
    watchers: [],
    hcStatus: 1,
    hcGranted: false,
    hcGrantOnRequest: true,
    hcSteps: 0,
  });
}

const GRANTED: Perm = { granted: true, status: 'granted', canAskAgain: true };
const DENIED: Perm = { granted: false, status: 'denied', canAskAgain: false };

export const Pedometer = {
  isAvailableAsync: jest.fn(async () => stepsFake.available),
  getPermissionsAsync: jest.fn(async () => stepsFake.perm),
  requestPermissionsAsync: jest.fn(async () => {
    stepsFake.perm = stepsFake.grantOnRequest ? GRANTED : DENIED;
    return stepsFake.perm;
  }),
  getStepCountAsync: jest.fn(async () => ({ steps: stepsFake.steps })),
  watchStepCount: jest.fn((cb: (r: { steps: number }) => void) => {
    stepsFake.watchers.push(cb);
    return {
      remove: () => {
        stepsFake.watchers = stepsFake.watchers.filter((w) => w !== cb);
      },
    };
  }),
};

const STEPS = { accessType: 'read', recordType: 'Steps' };

export const healthConnect = {
  getSdkStatus: jest.fn(async () => stepsFake.hcStatus),
  initialize: jest.fn(async () => true),
  getGrantedPermissions: jest.fn(async () => (stepsFake.hcGranted ? [STEPS] : [])),
  requestPermission: jest.fn(async () => {
    stepsFake.hcGranted = stepsFake.hcGrantOnRequest;
    return stepsFake.hcGranted ? [STEPS] : [];
  }),
  aggregateRecord: jest.fn(async () => ({ COUNT_TOTAL: stepsFake.hcSteps, dataOrigins: [] })),
};
