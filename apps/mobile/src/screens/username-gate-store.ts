import { create } from "zustand";

interface UsernameGateState {
  /// "Not Now" was pressed: the sheet stays down until the app is opened again.
  dismissed: boolean;
  dismiss: () => void;
}

export const useUsernameGate = create<UsernameGateState>((set) => ({
  dismissed: false,
  dismiss: () => set({ dismissed: true }),
}));
