import type { ReactNode } from "react";
import { View, useWindowDimensions } from "react-native";
import { useWindowOverride } from "../ui/window-override.ts";

/// The app in the window size a check asked for (`hooks.window`), scaled down to fit the
/// real one; the real window as it is otherwise.
/// `clear` for one over the app (a sheet's window), which lets the app show through.
export function WindowFrame({ children, clear }: { children: ReactNode; clear?: boolean }) {
  const size = useWindowOverride((s) => s.size);
  const real = useWindowDimensions();
  if (!size) return children;
  const scale = Math.min(1, real.width / size.width, real.height / size.height);
  return (
    <View className={clear ? "flex-1" : "flex-1 bg-black"}>
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
