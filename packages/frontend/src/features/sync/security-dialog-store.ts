import { create } from "zustand";

interface SecurityDialogState {
  /// Opened from Settings. An account that owes two-factor sees the dialog without this.
  open: boolean;
  show: () => void;
  close: () => void;
}

export const useSecurityDialog = create<SecurityDialogState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  close: () => set({ open: false }),
}));
