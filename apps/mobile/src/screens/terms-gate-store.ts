import { create } from "zustand";

interface TermsGateState {
  /// "Not Now" was pressed: the sheet stays down until Settings brings it back or the app is
  /// opened again.
  dismissed: boolean;
  /// Counts the times Settings asked for the sheet again.
  reopened: number;
  dismiss: () => void;
  reopen: () => void;
}

export const useTermsGate = create<TermsGateState>((set) => ({
  dismissed: false,
  reopened: 0,
  dismiss: () => set({ dismissed: true }),
  reopen: () => set((state) => ({ dismissed: false, reopened: state.reopened + 1 })),
}));
