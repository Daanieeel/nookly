import { useMemo, useRef } from "react";
import { Dimensions, type View } from "react-native";
import { useWindowOverride } from "../window-override.ts";
import type { Rect } from "./placement.ts";

/// What a popover opens from (D83, 2.1): a measured view, or a point (a long press).
export type Anchor = { measure(): Promise<Rect | null> } | Rect;

/// The window's scale under a development window size (`hooks.window`, D84): measured
/// rectangles are in the real window's points, the app lays out in the asked for ones.
function overrideScale(): number {
  const size = useWindowOverride.getState().size;
  if (!size) return 1;
  const real = Dimensions.get("window");
  return Math.min(1, real.width / size.width, real.height / size.height);
}

/// A rectangle measured in the real window, in the app's points.
export function toWindow(rect: Rect): Rect {
  const scale = overrideScale();
  return {
    x: rect.x / scale,
    y: rect.y / scale,
    width: rect.width / scale,
    height: rect.height / scale,
  };
}

/// Where `anchor` is in the window, now; null once it is gone.
export async function anchorRect(anchor: Anchor | undefined): Promise<Rect | null> {
  if (!anchor) return null;
  if (!("measure" in anchor)) return anchor;
  return anchor.measure();
}

/// A point as an anchor: the popover opens beside it, as a context menu at a finger.
export const pointAnchor = (x: number, y: number): Rect => ({ x, y, width: 0, height: 0 });

/// A ref for what opens a popover, and the anchor that measures it in the window when the
/// popover opens and whenever it moves (a rotation). Unmounted, it has no place: the
/// popover closes.
export function useAnchor<T extends View = View>() {
  const ref = useRef<T>(null);
  return useMemo(
    () => ({
      ref,
      measure: () =>
        new Promise<Rect | null>((resolve) => {
          const view = ref.current;
          if (!view) return resolve(null);
          view.measureInWindow((x, y, width, height) => resolve(toWindow({ x, y, width, height })));
        }),
    }),
    [],
  );
}
