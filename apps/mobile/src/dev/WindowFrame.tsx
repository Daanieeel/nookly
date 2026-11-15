import type { ReactNode } from "react";
import { View, useWindowDimensions } from "react-native";
import { useWindowOverride } from "../ui/window-override.ts";

/// The app in the window size a check asked for (`hooks.window`), scaled down to fit the
/// real one; the real window as it is otherwise.
export function WindowFrame({ children }: { children: ReactNode }) {
  const size = useWindowOverride((s) => s.size);
  const real = useWindowDimensions();
  if (!size) return children;
  const scale = Math.min(1, real.width / size.width, real.height / size.height);
  return (
    <View className="flex-1 bg-black">
      <View
        style={{
          width: size.width,
          height: size.height,
          transform: [{ scale }],
          transformOrigin: "top left",
          overflow: "hidden",
        }}
      >
        {children}
      </View>
    </View>
  );
}
