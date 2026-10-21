import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";

/// What the sidebar and the details of an open item tell each other. The page sits between
/// them, so a swipe from one never lands on the other: it goes back to the page first.
interface Panes {
  sidebarOpen: boolean;
  detailsOpen: boolean;
  /// A page that moves sideways itself (the calendar's days) leaves the sidebar only the
  /// left edge to be swiped open from.
  sidebarEdgeOnly: boolean;
  setSidebarEdgeOnly(edgeOnly: boolean): void;
  setSidebarOpen(open: boolean): void;
  setDetailsOpen(open: boolean): void;
}

/// How far a finger may wander sideways before a touch is a swipe and no longer a tap: the
/// rows of the sidebar answer a press that moves a little, wherever on the row it lands.
export const TAP_SLOP = 16;

/// A distance no finger travels, for the side of a swipe range a drawer never starts or
/// fails on. The gesture handler reads a range as [how far left, how far right] the finger
/// may go before the pan starts (or fails), the first at most 0 and the second at least 0.
export const NEVER = 10_000;

const PanesContext = createContext<Panes | null>(null);

export function PanesProvider({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [sidebarEdgeOnly, setSidebarEdgeOnly] = useState(false);
  const panes = useMemo(
    () => ({
      sidebarOpen,
      detailsOpen,
      sidebarEdgeOnly,
      setSidebarOpen,
      setDetailsOpen,
      setSidebarEdgeOnly,
    }),
    [sidebarOpen, detailsOpen, sidebarEdgeOnly],
  );
  return <PanesContext.Provider value={panes}>{children}</PanesContext.Provider>;
}

export function usePanes(): Panes | null {
  return useContext(PanesContext);
}

export interface SwipeOpens {
  sidebar: boolean;
  details: boolean;
}

/// Whether a swipe may open each: not the sidebar while the details are out, and not the
/// details while the sidebar is.
export function useSwipeOpens(): SwipeOpens {
  const panes = usePanes();
  return { sidebar: !panes?.detailsOpen, details: !panes?.sidebarOpen };
}

/// Called by the details drawer with whether it is open; it is closed again for the
/// others when the item goes away.
export function useReportDetailsOpen(open: boolean) {
  const setDetailsOpen = usePanes()?.setDetailsOpen;
  useEffect(() => {
    setDetailsOpen?.(open);
    return () => setDetailsOpen?.(false);
  }, [open, setDetailsOpen]);
}

/// Called by a page that swipes sideways itself, while it is shown.
export function useSidebarEdgeOnly(active: boolean) {
  const setEdgeOnly = usePanes()?.setSidebarEdgeOnly;
  useEffect(() => {
    setEdgeOnly?.(active);
    return () => setEdgeOnly?.(false);
  }, [active, setEdgeOnly]);
}
