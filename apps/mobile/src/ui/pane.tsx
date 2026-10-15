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

/// The width a page has to itself: the window's, less the sidebar when it sits beside it.
export function usePaneWidth(): number {
  const { width } = useWindowDimensions();
  return useSidebarBeside() ? width - SIDEBAR_WIDTH : width;
}
