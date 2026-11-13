import { LIST_ROW_CLASSES } from "@nookly/frontend/classes";
import { SEPARATOR_CLASSES } from "@nookly/ui/classes";
import { Pressable, View } from "react-native";
import { withState } from "./classes.ts";
import { Label } from "./kit/Label.tsx";
import { useSemantic } from "./kit/scheme.ts";
import { SPACE } from "./tokens.ts";
import { LIST_ROW } from "./touch.ts";

/// The line under a list row, the desktop's (`LIST_ROW_CLASSES`), for rows of other
/// content in a `Section`.
export const ROW_DIVIDER = LIST_ROW_CLASSES.split(" ")
  .filter((name) => name.startsWith("border-"))
  .join(" ");

/// A list row as iOS's plain lists draw it, with the desktop's content (`LIST_ROW_CLASSES`):
/// an icon, a title with an optional line below, and something trailing. At least a finger
/// tall; it darkens the moment a finger lands.
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
  const pressed = useSemantic("pressed");
  const touchable = Boolean(onPress || onLongPress);
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      onLongPress={onLongPress}
      unstable_pressDelay={0}
      className={ROW_DIVIDER}
      style={({ pressed: down }) => ({
        minHeight: subtitle ? 58 : LIST_ROW.minHeight,
        flexDirection: "row",
        alignItems: "center",
        gap: SPACE.md,
        paddingHorizontal: SPACE.xs,
        paddingVertical: SPACE.sm,
        backgroundColor: down && touchable ? pressed : undefined,
        opacity: muted ? 0.5 : 1,
      })}
    >
      {icon}
      <View style={{ flex: 1, gap: 1 }}>
        <Label numberOfLines={1}>{title}</Label>
        {subtitle ? (
          <Label type="subheadline" color="secondaryLabel" numberOfLines={1}>
            {subtitle}
          </Label>
        ) : null}
      </View>
      {trailing}
    </Pressable>
  );
}

/// Rows under a small heading, flat on the page with a thin line between them, the way iOS
/// draws a plain list and the desktop lists items. No card: on the desktop a box is for
/// things that are boxes by nature, not for every list (settings use `GroupedSection`).
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
    <View>
      {title || action ? (
        <View
          style={{
            minHeight: 32,
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: SPACE.xs,
          }}
        >
          {title ? (
            <Label
              type="footnote"
              color="secondaryLabel"
              weight="500"
              accessibilityRole="header"
              accessibilityLabel={title}
              style={{ flex: 1 }}
            >
              {title.toUpperCase()}
            </Label>
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
    <View style={{ paddingHorizontal: SPACE.xs, paddingVertical: SPACE.md }}>
      <Label color="secondaryLabel">{text}</Label>
    </View>
  );
}
