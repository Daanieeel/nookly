import { createContext, useContext } from "react";
import { useWindowDimensions } from "react-native";

/// From this window width (an iPad, a phone held wide) the sidebar stays open beside the
/// page, closer to the desktop, instead of waiting behind it.
export const TABLET_WIDTH = 768;
export const SIDEBAR_WIDTH = 320;

const SidebarBeside = createContext(false);
export const SidebarBesideProvider = SidebarBeside.Provider;

/// Whether the sidebar is shown beside the page.
export function useSidebarBeside(): boolean {
  return useContext(SidebarBeside);
}

/// Whether the window is wide enough for that.
export function useIsTablet(): boolean {
  return useWindowDimensions().width >= TABLET_WIDTH;
}

export const INSPECTOR_WIDTH = 340;

/// Whether a details pane sits beside the page, so the page leaves labels and links to it.
const InspectorShown = createContext(false);
export const InspectorShownProvider = InspectorShown.Provider;
export const useInspectorShown = () => useContext(InspectorShown);

/// The width a page has to itself: the window's, less the sidebar and the details pane when
/// they sit beside it.
export function usePaneWidth(): number {
  const { width } = useWindowDimensions();
  const sidebar = useSidebarBeside() ? SIDEBAR_WIDTH : 0;
  const inspector = useInspectorShown() ? INSPECTOR_WIDTH : 0;
  return width - sidebar - inspector;
}

/// From this width for the page (window less sidebar) a details pane fits beside it.
export const INSPECTOR_MIN_PANE = 900;
