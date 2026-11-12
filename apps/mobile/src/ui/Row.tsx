import { LIST_ROW_CLASSES, SECTION_HEADING_CLASSES } from "@nookly/frontend/classes";
import { SEPARATOR_CLASSES } from "@nookly/ui/classes";
import { Pressable, View } from "react-native";
import { cn, row, withState } from "./classes.ts";
import { Text } from "./Text.tsx";
import { LIST_ROW } from "./touch.ts";

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
      style={LIST_ROW}
      className={cn(
        row(LIST_ROW_CLASSES),
        "gap-3 rounded-md px-2 active:bg-accent/40",
        "h-auto",
        subtitle && "py-2",
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

/// Rows under a small heading (`SECTION_HEADING_CLASSES`), flat on the page with a thin
/// line between them, the way the desktop lists settings and items. No card: on the desktop
/// a box is for things that are boxes by nature, not for every list.
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
      <View>{children}</View>
    </View>
  );
}

/// The desktop's horizontal `Separator`, for content that isn't rows.
export function Separator() {
  return <View className={withState(SEPARATOR_CLASSES, { orientation: "horizontal" })} />;
}

export function Empty({ text }: { text: string }) {
  return (
    <View className="px-1 py-3">
      <Text tone="muted">{text}</Text>
    </View>
  );
}
