// Gestures need a finger; the gallery has a mouse, and nothing in it is dragged. A gesture
// is a builder that accepts every call and does nothing, and a detector shows its child.
import type { ReactNode } from "react";
import { View } from "./react-native";

const builder = (): unknown =>
  new Proxy(function () {}, {
    get: () => builder,
    apply: () => builder(),
  });

export const Gesture = new Proxy({} as Record<string, () => unknown>, { get: () => builder });

export function GestureDetector({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

export function GestureHandlerRootView(props: Record<string, unknown>) {
  return <View {...props} />;
}

export const State = { UNDETERMINED: 0, FAILED: 1, BEGAN: 2, CANCELLED: 3, ACTIVE: 4, END: 5 };
export const PointerType = { TOUCH: 0, STYLUS: 1, MOUSE: 2, KEY: 3, OTHER: 4 };
export type PanGesture = unknown;
