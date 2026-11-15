import type { HostInstance } from "react-native";
import type { Rect } from "./placement.ts";
import { type Anchor, pointAnchor, toWindow } from "./anchor.ts";

/// Where the last finger (or pointer) went down in the tablet's window, so a menu or picker
/// opened by it shows as a popover there when nothing names its anchor (D83, 2.3): a long
/// press menu at the finger, a field's picker on the field. The view touched is measured
/// again whenever the popover is placed, so it follows the view when a dialog moves with
/// the keyboard; once that view is gone, the point stays.

/// How long a touch still says where something opened from.
const FRESH_MS = 1500;

/// What a touch landed on: what can say where it is in the window.
type Measurable = Pick<HostInstance, "measureInWindow">;

let last: { at: number; point: Rect; target: Measurable | undefined } | null = null;

/// The tablet shell's root calls this for every touch that starts in it.
export function noteTouch(event: {
  nativeEvent: { pageX: number; pageY: number };
  target?: Measurable;
}) {
  const { pageX, pageY } = event.nativeEvent;
  last = { at: Date.now(), point: toWindow(pointAnchor(pageX, pageY)), target: event.target };
}

/// What the last touch started on, if it was just now: the view, or the point.
export function recentTouch(now = Date.now()): Anchor | undefined {
  if (!last || now - last.at > FRESH_MS) return undefined;
  const { point, target } = last;
  if (!target) return point;
  return {
    measure: () =>
      new Promise<Rect | null>((resolve) => {
        try {
          target.measureInWindow((x, y, width, height) =>
            resolve(width || height ? toWindow({ x, y, width, height }) : point),
          );
        } catch {
          resolve(point);
        }
      }),
  };
}

/// Forgets it (tests).
export function forgetTouch() {
  last = null;
}
