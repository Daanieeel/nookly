import { create } from "zustand";

interface TermsGateState {
  /// "Not Now" was pressed: the dialog stays closed until Settings brings it back or the
  /// app is opened again.
  dismissed: boolean;
  dismiss: () => void;
  reopen: () => void;
  reset: () => void;
}

export const useTermsGate = create<TermsGateState>((set) => ({
  dismissed: false,
  dismiss: () => set({ dismissed: true }),
  reopen: () => set({ dismissed: false }),
  reset: () => set({ dismissed: false }),
}));
