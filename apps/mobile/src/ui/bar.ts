import type { ReactElement } from "react";

/// The look of every button in the system's bar: the desktop's ghost icon button, tinted
/// like the bar's own, without the round glass background iOS 26 puts behind bar items.
/// Spread onto each `Stack.Toolbar.Button` (the toolbar reads its buttons directly, so they
/// are not wrapped).
export const BAR_BUTTON = { iconRenderingMode: "template", hidesSharedBackground: true } as const;

/// A bar item drawn by the app itself (`unstable_headerLeftItems`), without that background.
export function barItem(element: ReactElement) {
  return { type: "custom" as const, element, hidesSharedBackground: true };
}
