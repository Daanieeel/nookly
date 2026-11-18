import type { ComponentType, ReactNode } from "react";
import { Pressable, View, type ViewProps } from "react-native";
import { useSemantic } from "./kit/scheme.ts";
import { MIN_TOUCH } from "./touch.ts";

interface GlassProps extends ViewProps {
  glassEffectStyle?: "regular" | "clear";
  isInteractive?: boolean;
}

/// iOS's Liquid Glass (`expo-glass-effect`), where the build has it and the system draws
/// it; null elsewhere (an older iOS, a build without it, tests).
function systemGlass(): ComponentType<GlassProps> | null {
  try {
    // oxlint-disable-next-line typescript/no-require-imports -- only loadable in a build that has it
    const glass: {
      GlassView: ComponentType<GlassProps>;
      isLiquidGlassAvailable(): boolean;
    } = require("expo-glass-effect");
    return glass.isLiquidGlassAvailable() ? glass.GlassView : null;
  } catch {
    return null;
  }
}

const Glass = systemGlass();

/// A round button on the system's glass, as the bar buttons at the top of a page are: for
/// a button that sits outside a navigation bar (the sidebar's Search). Without Liquid Glass
/// it is a filled circle.
export function GlassButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  const fill = useSemantic("fill");
  const round = { width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: MIN_TOUCH / 2 };
  const face = (
    <View style={[round, { alignItems: "center", justifyContent: "center" }]}>{children}</View>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [round, { opacity: pressed && !Glass ? 0.6 : 1 }]}
    >
      {Glass ? (
        <Glass glassEffectStyle="regular" isInteractive style={round}>
          {face}
        </Glass>
      ) : (
        <View style={[round, { backgroundColor: fill }]}>{face}</View>
      )}
    </Pressable>
  );
}
