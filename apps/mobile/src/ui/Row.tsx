import { LIST_ROW_CLASSES, SECTION_HEADING_CLASSES } from "@nookly/frontend/classes";
import { CARD_CLASSES, SEPARATOR_CLASSES } from "@nookly/ui/classes";
import { Pressable, View } from "react-native";
import { cn, row, withState } from "./classes.ts";
import { Text } from "./Text.tsx";
import { TOUCH_ROW } from "./touch.ts";

/// A list row, the desktop's (`LIST_ROW_CLASSES`): an icon, a title with an optional
/// line below, and something trailing. Taller with a second line, so it stays easy to hit.
export function Row({
  title,
  subtitle,
  icon,
  trailing,
  onPress,
  onLongPress,
  muted,
  accessibilityHint,
}: {
  title: string;
  subtitle?: string | null;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
  onPress?: () => void;
  /// The item's menu, the desktop's right click.
  onLongPress?: () => void;
  /// A deleted item still shows, dimmed, like on the desktop.
  muted?: boolean;
  accessibilityHint?: string;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      onLongPress={onLongPress}
      style={TOUCH_ROW}
      className={cn(
        row(LIST_ROW_CLASSES),
        "gap-3 px-4 active:bg-accent/40",
        subtitle && "h-auto min-h-12 py-2",
        muted && "opacity-50",
      )}
    >
      {icon}
      <View className="flex-1 gap-0.5">
        <Text numberOfLines={1}>{title}</Text>
        {subtitle ? (
          <Text variant="small" tone="muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </Pressable>
  );
}

/// The line under a list row, the desktop's (`LIST_ROW_CLASSES`), for rows of other
/// content in a `Section`.
export const ROW_DIVIDER = LIST_ROW_CLASSES.split(" ")
  .filter((name) => name.startsWith("border-"))
  .join(" ");

/// Rows on the desktop's `Card` under a small heading (`SECTION_HEADING_CLASSES`). The
/// last row's bottom line tucks under the card's edge.
export function Section({
  title,
  children,
  action,
}: {
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <View className="gap-1">
      {title || action ? (
        <View className="min-h-8 flex-row items-center px-1">
          {title ? (
            <Text accessibilityRole="header" className={cn(SECTION_HEADING_CLASSES, "flex-1 pb-0")}>
              {title}
            </Text>
          ) : null}
          {action}
        </View>
      ) : null}
      <View className={cn(CARD_CLASSES, "gap-0 overflow-hidden")}>
        <View className="-mb-px">{children}</View>
      </View>
    </View>
  );
}

/// The desktop's horizontal `Separator`, for content that isn't rows.
export function Separator() {
  return <View className={withState(SEPARATOR_CLASSES, { orientation: "horizontal" })} />;
}

export function Empty({ text }: { text: string }) {
  return (
    <View className="p-4">
      <Text tone="muted">{text}</Text>
    </View>
  );
}
