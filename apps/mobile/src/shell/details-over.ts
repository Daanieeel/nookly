import { create } from "zustand";

/// The details pane over a page too narrow to keep it beside (1.7): whether it is open,
/// and whether the focused group has room for it beside the page, which decides what the
/// titlebar's details toggle does.
export const useDetailsOver = create<{ open: boolean; fits: boolean }>(() => ({
  open: false,
  fits: true,
}));
