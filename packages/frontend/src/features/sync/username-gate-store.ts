import { create } from "zustand";

interface UsernameGateState {
  /// "Not Now" was pressed: the dialog stays closed until the app is opened again.
  dismissed: boolean;
  dismiss: () => void;
  reset: () => void;
}

export const useUsernameGate = create<UsernameGateState>((set) => ({
  dismissed: false,
  dismiss: () => set({ dismissed: true }),
  reset: () => set({ dismissed: false }),
}));
