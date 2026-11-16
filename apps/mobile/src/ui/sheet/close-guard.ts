import { type ReactNode, createContext, useContext, useEffect, useRef } from "react";

/// What a sheet's content asks before the sheet goes at the person's request (Close, Escape,
/// a tap outside): the step to show instead (Discard?), or null to let it go.
export type CloseGuard = () => ReactNode | null;

export const CloseGuardContext = createContext<((guard: CloseGuard | null) => void) | null>(null);

/// While `on`, the sheet this is in shows `step` before it goes (a half written form).
export function useCloseGuard(on: boolean, step: () => ReactNode) {
  const set = useContext(CloseGuardContext);
  const latest = useRef(step);
  useEffect(() => {
    latest.current = step;
  });
  useEffect(() => {
    if (!set || !on) return;
    set(() => latest.current());
    return () => set(null);
  }, [set, on]);
}
