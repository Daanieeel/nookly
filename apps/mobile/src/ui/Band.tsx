import { IconChevronDown, IconChevronRight } from "@tabler/icons-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Badge } from "./Badge.tsx";
import { Text } from "./Text.tsx";
import { useTheme } from "./theme.ts";

/// A band of the page that folds away: a semester with its courses under it.
export function Band({
  icon,
  title,
  count,
  badge,
  children,
  initiallyOpen = true,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  badge?: string;
  children: React.ReactNode;
  initiallyOpen?: boolean;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(initiallyOpen);
  const Chevron = open ? IconChevronDown : IconChevronRight;
  return (
    <View className="gap-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        className="min-h-9 flex-row items-center gap-2"
      >
        <Chevron size={16} color={theme.colors.mutedForeground} />
        {icon}
        <Text className="font-medium">{title}</Text>
        <Text tone="muted">{count}</Text>
        {badge ? <Badge label={badge} variant="positive" size="sm" /> : null}
      </Pressable>
      {open ? children : null}
    </View>
  );
}
