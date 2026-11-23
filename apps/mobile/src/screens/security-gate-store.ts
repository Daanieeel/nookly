import { create } from "zustand";

interface SecurityGateState {
  /// "Later" was pressed: the sheet stays down until Settings brings it back or the app is
  /// opened again.
  dismissed: boolean;
  dismiss: () => void;
  reset: () => void;
}

export const useSecurityGate = create<SecurityGateState>((set) => ({
  dismissed: false,
  dismiss: () => set({ dismissed: true }),
  reset: () => set({ dismissed: false }),
}));
