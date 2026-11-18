import { useEffect, useRef } from "react";
import { create } from "zustand";
import type { KeyShortcut } from "../../modules/nookly-keys/src/index.ts";

/// The keys of the screen shown over everything (a study session's Space and 1 to 4), which
/// the shortcut host takes while it is up and gives back after. One screen at a time.
export const usePageKeys = create<{ keys: KeyShortcut[]; run: (id: string) => void }>(() => ({
  keys: [],
  run: () => {},
}));

/// Takes `keys` until the returned function gives them back.
export function setPageKeys(keys: KeyShortcut[], run: (id: string) => void): () => void {
  usePageKeys.setState({ keys, run });
  return () => {
    if (usePageKeys.getState().run === run) usePageKeys.setState({ keys: [], run: () => {} });
  };
}

/// While `on`, the screen's own keys, each doing `run(id)`.
export function usePageShortcuts(keys: KeyShortcut[], run: (id: string) => void, on: boolean) {
  const latest = useRef(run);
  useEffect(() => {
    latest.current = run;
  });
  const ids = keys.map((k) => k.id).join(" ");
  useEffect(() => {
    if (!on) return;
    return setPageKeys(keys, (id) => latest.current(id));
    // The keys are read through `ids`, which says when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, ids]);
}
