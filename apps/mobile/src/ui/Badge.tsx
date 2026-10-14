import { View } from "react-native";
import { Text } from "./Text.tsx";
import { useTheme } from "./theme.ts";

/// A small label, like the desktop's `Badge`. `color` tints it, for status and Spaces.
export function Badge({ label, color }: { label: string; color?: string }) {
  const theme = useTheme();
  const tint = color ?? theme.colors.mutedForeground;
  return (
    <View
      style={{
        paddingHorizontal: theme.space(1.5),
        paddingVertical: 2,
        borderRadius: theme.radius.sm,
        borderWidth: 1,
        borderColor: `${tint}80`,
        backgroundColor: `${tint}1a`,
      }}
    >
      <Text variant="small" style={{ color: tint }}>
        {label}
      </Text>
    </View>
  );
}

/// A Space's color as a dot, as next to items in the desktop's lists.
export function SpaceDot({ color }: { color: string }) {
  return <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />;
}
