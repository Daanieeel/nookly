import { useEffect, useRef } from "react";

/// The desktop's `Cmd+Option+Up` and `Down`: show the Space before or after in the
/// sidebar. The shortcut fires here; the sidebar, which knows the Spaces, listens.

const listeners = new Set<(direction: 1 | -1) => void>();

export function stepSpace(direction: 1 | -1) {
  for (const listener of listeners) listener(direction);
}

export function useOnSpaceStep(listener: (direction: 1 | -1) => void) {
  const latest = useRef(listener);
  useEffect(() => {
    latest.current = listener;
  });
  useEffect(() => {
    const call = (direction: 1 | -1) => latest.current(direction);
    listeners.add(call);
    return () => void listeners.delete(call);
  }, []);
}
