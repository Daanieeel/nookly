import { useRouter } from "expo-router";
import type { ComponentType } from "react";
import { RouteSheet, type SheetSize, useSheet } from "./Sheet.tsx";

/// A route drawn as the app's sheet (a create form, the icon picker): its screen is see
/// through (`SHEET_ROUTE` in the root layout) and `Screen` inside it lays out without
/// scrolling, since the sheet scrolls.
export function sheetRoute<P extends object>(
  title: string,
  Content: ComponentType<P>,
  size?: SheetSize,
) {
  return function SheetRouteScreen(props: P) {
    const router = useRouter();
    return (
      <RouteSheet title={title} size={size} onClosed={() => router.canGoBack() && router.back()}>
        <Content {...props} />
      </RouteSheet>
    );
  };
}

/// The options of a route that is a sheet: no header, no animation of its own (the sheet
/// has one), the page behind it showing.
export const SHEET_ROUTE = {
  presentation: "transparentModal",
  animation: "none",
  headerShown: false,
  gestureEnabled: false,
  contentStyle: { backgroundColor: "transparent" },
} as const;

/// Closes the sheet a form sits in (its Done button), or goes back outside one.
export function useCloseSheet() {
  const sheet = useSheet();
  const router = useRouter();
  return (then?: () => void) => {
    if (sheet) sheet.close(then);
    else {
      if (router.canGoBack()) router.back();
      then?.();
    }
  };
}
