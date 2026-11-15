import { z } from "zod";
import { usePreference } from "../data/preferences.ts";

const flag = z.boolean();

/// Whether the iPad's sidebar is folded away (a device preference, like the desktop's).
export function useSidebarCollapsed() {
  return usePreference("shell.sidebarCollapsed", flag, false);
}

/// Whether the details pane beside a page is folded away.
export function useInspectorCollapsed() {
  return usePreference("shell.inspectorCollapsed", flag, false);
}

/// Whether the sidebar stays beside the page in a medium window 900 wide or more, instead
/// of sliding over it.
export function useSidebarPinned() {
  return usePreference("shell.sidebarPinned", flag, false);
}
