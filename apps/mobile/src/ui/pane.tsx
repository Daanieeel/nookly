import { createContext, useContext } from "react";
import { useWindowDimensions } from "react-native";

export interface WindowSize {
  width: number;
  height: number;
}

/// The window's size, unless a test says otherwise (an iPad's window in a test of a
/// screen): the one place the app asks for it.
const WindowSizeOverride = createContext<WindowSize | null>(null);
export const WindowSizeProvider = WindowSizeOverride.Provider;

export function useWindowSize(): WindowSize {
  const override = useContext(WindowSizeOverride);
  const { width, height } = useWindowDimensions();
  return override ?? { width, height };
}

/// How much room the window has, which decides the shell (D83): `compact` is the phone's
/// layout (an iPhone, an iPad in Slide Over or a narrow window), `medium` the tablet's with
/// the sidebar over the page (an 11-inch iPad or a mini in portrait), `expanded` the
/// tablet's with the sidebar beside it (landscape, a 13-inch iPad either way).
export type WindowClass = "compact" | "medium" | "expanded";

export const MEDIUM_WIDTH = 600;
export const EXPANDED_WIDTH = 1000;

export function windowClassOf(width: number): WindowClass {
  if (width >= EXPANDED_WIDTH) return "expanded";
  if (width >= MEDIUM_WIDTH) return "medium";
  return "compact";
}

export type Orientation = "portrait" | "landscape";

export function orientationOf({ width, height }: WindowSize): Orientation {
  return width > height ? "landscape" : "portrait";
}

export function useWindowClass(): WindowClass {
  return windowClassOf(useWindowSize().width);
}

export function useOrientation(): Orientation {
  return orientationOf(useWindowSize());
}

/// Whether the window gets the tablet's shell, the desktop made for touch.
export function useIsTablet(): boolean {
  return useWindowClass() !== "compact";
}

/// The desktop's sidebar width, which the tablet keeps.
export const SIDEBAR_WIDTH = 280;

const SidebarBeside = createContext(false);
export const SidebarBesideProvider = SidebarBeside.Provider;

/// Whether the sidebar is shown beside the page.
export function useSidebarBeside(): boolean {
  return useContext(SidebarBeside);
}

export const INSPECTOR_WIDTH = 340;

/// Whether a details pane sits beside the page, so the page leaves labels and links to it.
const InspectorShown = createContext(false);
export const InspectorShownProvider = InspectorShown.Provider;
export const useInspectorShown = () => useContext(InspectorShown);

/// The width a page group has, when the shell lays one out (a split view's half); null
/// outside one, where the page has the window less what sits beside it.
const GroupWidth = createContext<number | null>(null);
export const GroupWidthProvider = GroupWidth.Provider;

/// The width a page has to itself: its group's in the tablet's shell, else the window's
/// less the sidebar and the details pane when they sit beside it.
export function usePageWidth(): number {
  const group = useContext(GroupWidth);
  const { width } = useWindowSize();
  const sidebar = useSidebarBeside() ? SIDEBAR_WIDTH : 0;
  const inspector = useInspectorShown() ? INSPECTOR_WIDTH : 0;
  return (group ?? width - sidebar) - inspector;
}

/// From this width for the page a details pane fits beside it and leaves the page 600.
export const INSPECTOR_MIN_PANE = 600 + INSPECTOR_WIDTH;

/// The narrowest a group of a split view gets, as the desktop's.
export const SPLIT_MIN_GROUP = 360;
