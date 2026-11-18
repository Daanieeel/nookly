import { createContext, useContext } from "react";

/// Where a page sits in the tablet's window: its tab and group, and whether it shows. Its
/// own module, so a page's parts (the editor) can read it without the shell's.
export interface PageHostValue {
  tabId: string;
  groupId: string;
  path: string;
  /// The tab is the one its group shows, and the group is on screen.
  active: boolean;
  /// Its group is the focused one (the one the sidebar and shortcuts act on).
  focused: boolean;
}

export const PageHostContext = createContext<PageHostValue | null>(null);

/// The tablet page this is in, or null on a phone (or over the window, in a sheet).
export function usePageHost(): PageHostValue | null {
  return useContext(PageHostContext);
}
