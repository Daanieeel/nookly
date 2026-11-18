import type { ImageSourcePropType } from "react-native";

/// The look of every button in the system's bar: a Tabler icon tinted like the bar's own,
/// on the round glass background iOS 26 puts behind bar items, as the back button has.
/// Spread onto each `Stack.Toolbar.Button` (the toolbar reads its buttons directly, so they
/// are not wrapped).
export const BAR_BUTTON = { iconRenderingMode: "template" } as const;

/// A button of the system's bar set from a screen's options (`unstable_headerLeftItems`,
/// `unstable_headerRightItems`), the same native button as `Stack.Toolbar.Button`: a
/// Tabler icon (`TOOLBAR_ICONS`) tinted like the bar, on the round background.
export function barButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: ImageSourcePropType;
  onPress: () => void;
}) {
  return {
    type: "button" as const,
    label,
    accessibilityLabel: label,
    icon: { type: "image" as const, source: icon },
    onPress,
  };
}
