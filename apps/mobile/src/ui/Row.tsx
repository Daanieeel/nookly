import { Pressable, View } from "react-native";
import { Text } from "./Text.tsx";
import { useTheme } from "./theme.ts";

/// A list row: an icon, a title with an optional line below, and something trailing.
/// At least 44 points tall, so it is easy to hit.
export function Row({
  title,
  subtitle,
  icon,
  trailing,
  onPress,
  muted,
  accessibilityHint,
}: {
  title: string;
  subtitle?: string | null;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
  onPress?: () => void;
  /// A deleted item still shows, dimmed, like on the desktop.
  muted?: boolean;
  accessibilityHint?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        paddingHorizontal: theme.space(4),
        paddingVertical: theme.space(2),
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(3),
        backgroundColor: pressed ? theme.colors.accent : theme.colors.card,
        opacity: muted ? 0.5 : 1,
      })}
    >
      {icon}
      <View style={{ flex: 1, gap: 2 }}>
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

/// Rows grouped on a card under a small heading.
export function Section({
  title,
  children,
  action,
}: {
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space(2) }}>
      {title || action ? (
        <View
          style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: theme.space(1) }}
        >
          {title ? (
            <Text
              variant="label"
              tone="muted"
              accessibilityRole="header"
              style={{ flex: 1, textTransform: "uppercase", letterSpacing: 0.5 }}
            >
              {title}
            </Text>
          ) : null}
          {action}
        </View>
      ) : null}
      <View
        style={{
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.card,
          overflow: "hidden",
        }}
      >
        {children}
      </View>
    </View>
  );
}

export function Separator() {
  const theme = useTheme();
  return (
    <View style={{ height: 1, backgroundColor: theme.colors.border, marginLeft: theme.space(4) }} />
  );
}

export function Empty({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <View style={{ padding: theme.space(4) }}>
      <Text tone="muted">{text}</Text>
    </View>
  );
}
