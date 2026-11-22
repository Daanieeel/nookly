import { IconCheck } from "@tabler/icons-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { haptic } from "./haptics.ts";
import { Text } from "./Text.tsx";
import { useTheme } from "./theme.ts";
import { RADIUS, SPACE } from "./tokens.ts";
import { MIN_TOUCH } from "./touch.ts";

const BOX = 24;

/// A box to tick with its words beside it, a finger tall: for agreeing to something. `label`
/// is what a screen reader says; the words themselves may hold links, which take their own
/// presses. `error` says under it what is wrong.
export function CheckboxRow({
  checked,
  onChange,
  label,
  error,
  disabled = false,
  children,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  error?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: SPACE.xs }}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        accessibilityState={{ checked, disabled }}
        disabled={disabled}
        onPress={() => {
          haptic("select");
          onChange(!checked);
        }}
        style={{
          minHeight: MIN_TOUCH,
          flexDirection: "row",
          alignItems: "flex-start",
          gap: SPACE.md,
          paddingVertical: SPACE.sm,
        }}
      >
        <View
          style={{
            width: BOX,
            height: BOX,
            marginTop: 1,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: RADIUS.badge,
            borderCurve: "continuous",
            borderWidth: 1.5,
            borderColor: error
              ? theme.colors.destructive
              : checked
                ? theme.colors.primary
                : theme.colors.border,
            backgroundColor: checked ? theme.colors.primary : "transparent",
          }}
        >
          {checked ? <IconCheck size={16} color={theme.colors.primaryForeground} /> : null}
        </View>
        <View style={{ flex: 1 }}>{children}</View>
      </Pressable>
      {error ? (
        <Text variant="small" tone="destructive">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
