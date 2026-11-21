// A blurred backdrop, drawn the way a browser draws one.
import type { ComponentProps } from "react";
import { View } from "./react-native";

export function BlurView({
  intensity = 50,
  tint,
  style,
  ...props
}: ComponentProps<typeof View> & { intensity?: number; tint?: string }) {
  const dark = tint?.includes("dark");
  return (
    <View
      {...props}
      style={[
        style,
        {
          backdropFilter: `blur(${intensity / 3}px)`,
          backgroundColor: dark ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.5)",
        } as object,
      ]}
    />
  );
}
