import { requireNativeView } from "expo";
import { type ComponentType, type ReactNode } from "react";
import { View, type ViewProps } from "react-native";
import { hasPointerStyle } from "./index.ts";

interface Props extends ViewProps {
  /// `button`: the system's effect for a button of this size, a lift or a highlight.
  /// `resize`: a bar with arrows to either side, for a divider dragged sideways.
  effect: "button" | "resize";
  /// The corners of the button's lift or highlight.
  cornerRadius?: number;
  children?: ReactNode;
}

const Native: ComponentType<Props> | null = hasPointerStyle
  ? requireNativeView<Props>("NooklyWindow", "NooklyPointerStyleView")
  : null;

/// How an iPad's pointer looks over its children, as over iPadOS's own controls (D100); a
/// plain view where there is no pointer to style (tests, Android, an older build).
export function PointerStyle({ effect, cornerRadius, ...props }: Props) {
  if (!Native) return <View {...props} />;
  return <Native {...props} effect={effect} cornerRadius={cornerRadius} />;
}
