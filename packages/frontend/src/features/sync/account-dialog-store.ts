import { create } from "zustand";

export type AccountMode = "signIn" | "signUp" | "reset";

interface AccountDialogState {
  open: boolean;
  mode: AccountMode;
  /// The first sync's progress dialog, shown after signing in on a device with data.
  firstSyncOpen: boolean;
  show: (mode?: AccountMode) => void;
  setMode: (mode: AccountMode) => void;
  close: () => void;
  setFirstSyncOpen: (open: boolean) => void;
}

/// Where the account dialog and the first sync's dialog are opened from: Settings,
/// the titlebar's sync status and the commands palette.
export const useAccountDialog = create<AccountDialogState>((set) => ({
  open: false,
  mode: "signIn",
  firstSyncOpen: false,
  show: (mode = "signIn") => set({ open: true, mode }),
  setMode: (mode) => set({ mode }),
  close: () => set({ open: false }),
  setFirstSyncOpen: (firstSyncOpen) => set({ firstSyncOpen }),
}));
