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
