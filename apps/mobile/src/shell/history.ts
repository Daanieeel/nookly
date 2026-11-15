/// The top level pages the sidebar opens (Dashboard, Tasks, a module) are places, not steps:
/// going between them is not undone by a swipe from the screen's edge on a phone. (A
/// tablet's tabs have their own Back and Forward, `workspace.ts`.)
export const TOP_LEVEL_SCREEN = { gestureEnabled: false } as const;

/// Whether a page has the system's bar: a phone's, never a tablet's, whose titlebar goes back
/// and forward and whose tabs name the page, as the desktop's do.
export function pageBar(tablet: boolean) {
  return { headerShown: !tablet };
}
