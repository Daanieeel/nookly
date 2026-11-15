import { requireNativeView } from "expo";
import { type ComponentType, type ReactNode } from "react";
import { View, type ViewProps } from "react-native";
import { windowModuleAvailable } from "./index.ts";

interface Props extends ViewProps {
  onSecondaryClick: (event: { nativeEvent: { x: number; y: number } }) => void;
  children?: ReactNode;
}

const Native: ComponentType<Props> | null = windowModuleAvailable
  ? requireNativeView<Props>("NooklyWindow", "NooklySecondaryClickView")
  : null;

/// Children that answer a right click, or a two finger click on a trackpad, with where it
/// was in their own points; a plain view where the system has no pointer (tests, Android).
export function SecondaryClick({ onSecondaryClick, ...props }: Props) {
  if (!Native) return <View {...props} />;
  return <Native {...props} onSecondaryClick={onSecondaryClick} />;
}
