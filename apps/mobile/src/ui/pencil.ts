import { type PanGesture, PointerType } from "react-native-gesture-handler";

/// A pan only a finger starts: over text fields an Apple Pencil stroke is Scribble's
/// handwriting, not a drag, so the pan gives it up at once. A tap with the Pencil is a touch
/// as before.
export function fingersOnly(pan: PanGesture): PanGesture {
  return pan.onTouchesDown((event, manager) => {
    if (event.pointerType === PointerType.STYLUS) manager.fail();
  });
}
