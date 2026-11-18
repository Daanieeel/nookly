import { create } from "zustand";

/// A toast of the tablet's window (3.7): only for a result nothing on screen is left to
/// show (`docs/05-ui-ux-direction.md`, Success and Error Feedback), saying exactly what
/// happened, with Undo where it can.
export interface Toast {
  id: number;
  title: string;
  action?: { label: string; onPress: () => void };
}

export const useToasts = create<{ toasts: Toast[]; hosts: number }>(() => ({
  toasts: [],
  hosts: 0,
}));

let ids = 0;

/// Shows a toast where a window draws them; where none does (a phone), nothing.
export function toast(next: Omit<Toast, "id">): void {
  if (useToasts.getState().hosts === 0) return;
  const shown: Toast = { ...next, id: ++ids };
  useToasts.setState((s) => ({ toasts: [...s.toasts, shown].slice(-3) }));
}

export function dismissToast(id: number): void {
  useToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}
