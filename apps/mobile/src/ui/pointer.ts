import { useState } from "react";
import type { PointerEvent } from "react-native";

/// The second button of a mouse or trackpad (a two finger click), as pointer events give it.
const SECONDARY = 2;

/// What a row does with an iPad's pointer (10.2): it knows while the pointer is over it, to
/// light up as the desktop's rows do, and a secondary click opens its menu (`onSecondary`,
/// the desktop's right click). Spread `handlers` on its `Pressable`.
export function usePointer(onSecondary?: () => void) {
  const [hovered, setHovered] = useState(false);
  return {
    hovered,
    handlers: {
      onHoverIn: () => setHovered(true),
      onHoverOut: () => setHovered(false),
      onPointerDown: (event: PointerEvent) => {
        if (event.nativeEvent.button === SECONDARY && onSecondary) onSecondary();
      },
    },
  };
}
