import { create } from 'zustand';

/**
 * Offline detection without an extra library: every API call reports whether the network
 * answered. `online` is null until the first call. UI reads it to show "Offline" hints;
 * nothing ever waits on it.
 */
type ConnectivityState = {
  online: boolean | null;
  lastOnlineAt: number | null;
  setOnline: (online: boolean, now?: number) => void;
};

export const useConnectivity = create<ConnectivityState>((set) => ({
  online: null,
  lastOnlineAt: null,
  setOnline: (online, now = Date.now()) =>
    set((s) => ({ online, lastOnlineAt: online ? now : s.lastOnlineAt })),
}));

export function isOnline(): boolean {
  return useConnectivity.getState().online !== false;
}
