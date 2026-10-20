import { create } from "zustand";

/// What the command palette is for: search everything, jump to a recent item, or run a
/// command. The desktop has one dialog for each; here one palette starts in each mode.
export type PaletteMode = "search" | "quick" | "commands";

interface ShellState {
  palette: PaletteMode | null;
  open(mode: PaletteMode): void;
  close(): void;
}

/// Bits of the iPad's window that more than one part needs to know about.
export const useShell = create<ShellState>((set) => ({
  palette: null,
  open: (mode) => set({ palette: mode }),
  close: () => set({ palette: null }),
}));
