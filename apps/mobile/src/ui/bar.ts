import type { ImageSourcePropType } from "react-native";

/// The look of every button in the system's bar: the desktop's ghost icon button, tinted
/// like the bar's own, without the round glass background iOS 26 puts behind bar items.
/// Spread onto each `Stack.Toolbar.Button` (the toolbar reads its buttons directly, so they
/// are not wrapped).
export const BAR_BUTTON = { iconRenderingMode: "template", hidesSharedBackground: true } as const;

/// A button of the system's bar set from a screen's options (`unstable_headerLeftItems`,
/// `unstable_headerRightItems`), the same native button as `Stack.Toolbar.Button`: a
/// Tabler icon (`TOOLBAR_ICONS`) tinted like the bar, without the round background.
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
    hidesSharedBackground: true,
  };
}
