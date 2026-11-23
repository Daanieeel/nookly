import { create } from "zustand";

interface SecurityGateState {
  /// "Later" was pressed: the sheet stays down until Settings brings it back or the app is
  /// opened again.
  dismissed: boolean;
  dismiss: () => void;
  /// Recovery codes an authenticator app made while two-factor is being set up, kept until
  /// Continue shows them.
  pendingCodes: string[] | null;
  holdCodes: (codes: string[] | null) => void;
  reset: () => void;
}

export const useSecurityGate = create<SecurityGateState>((set) => ({
  dismissed: false,
  dismiss: () => set({ dismissed: true }),
  pendingCodes: null,
  holdCodes: (pendingCodes) => set({ pendingCodes }),
  reset: () => set({ dismissed: false, pendingCodes: null }),
}));
