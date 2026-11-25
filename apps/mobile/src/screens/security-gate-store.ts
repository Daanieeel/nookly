import { create } from "zustand";

interface SecurityGateState {
  /// Recovery codes an authenticator app made while two-factor is being set up, kept until
  /// Continue shows them.
  pendingCodes: string[] | null;
  holdCodes: (codes: string[] | null) => void;
  reset: () => void;
}

export const useSecurityGate = create<SecurityGateState>((set) => ({
  pendingCodes: null,
  holdCodes: (pendingCodes) => set({ pendingCodes }),
  reset: () => set({ pendingCodes: null }),
}));
