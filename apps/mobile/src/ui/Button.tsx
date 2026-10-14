import { IconAlertTriangle, IconCheck } from "@tabler/icons-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, type PressableProps, View } from "react-native";
import { Text } from "./Text.tsx";
import { useTheme } from "./theme.ts";

export type ButtonStatus = "idle" | "pending" | "success" | "error";

/// A mutation's state as a button shows it, like the desktop's `statusOf`.
export function statusOf(mutation: {
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
}): ButtonStatus {
  if (mutation.isPending) return "pending";
  if (mutation.isError) return "error";
  return mutation.isSuccess ? "success" : "idle";
}

interface ButtonProps extends Omit<PressableProps, "children"> {
  label: string;
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  status?: ButtonStatus;
  successLabel?: string;
  errorLabel?: string;
  icon?: React.ReactNode;
}

/// Shows the result on itself, as on the desktop: a spinner while pending, a check
/// for two seconds on success, a warning that stays on error.
export function Button({
  label,
  variant = "secondary",
  status = "idle",
  successLabel,
  errorLabel,
  icon,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const theme = useTheme();
  const [showSuccess, setShowSuccess] = useState(false);
  useEffect(() => {
    if (status !== "success") return;
    setShowSuccess(true);
    const timer = setTimeout(() => setShowSuccess(false), 2000);
    return () => clearTimeout(timer);
  }, [status]);
  const colors = {
    primary: {
      bg: theme.colors.primary,
      fg: theme.colors.primaryForeground,
      border: theme.colors.primary,
    },
    secondary: {
      bg: theme.colors.secondary,
      fg: theme.colors.secondaryForeground,
      border: theme.colors.input,
    },
    ghost: { bg: "transparent", fg: theme.colors.foreground, border: "transparent" },
    destructive: {
      bg: theme.colors.destructive,
      fg: theme.colors.destructiveForeground,
      border: theme.colors.destructive,
    },
  }[variant];
  const text =
    status === "error" ? (errorLabel ?? label) : showSuccess ? (successLabel ?? label) : label;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityState={{ disabled: !!disabled, busy: status === "pending" }}
      disabled={disabled || status === "pending"}
      {...props}
      style={(state) => [
        {
          minHeight: 40,
          paddingHorizontal: theme.space(4),
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.bg,
          opacity: disabled ? 0.5 : state.pressed ? 0.8 : 1,
          alignItems: "center",
          justifyContent: "center",
        },
        style instanceof Function ? style(state) : style,
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(2) }}>
        {status === "pending" ? (
          <ActivityIndicator size="small" color={colors.fg} />
        ) : status === "error" ? (
          <IconAlertTriangle
            size={16}
            color={variant === "ghost" ? theme.colors.destructive : colors.fg}
          />
        ) : showSuccess ? (
          <IconCheck
            size={16}
            color={
              variant === "ghost" || variant === "secondary" ? theme.colors.positive : colors.fg
            }
          />
        ) : (
          icon
        )}
        <Text
          variant="label"
          style={{
            color: status === "error" && variant === "ghost" ? theme.colors.destructive : colors.fg,
            fontSize: theme.text.sm,
          }}
        >
          {text}
        </Text>
      </View>
    </Pressable>
  );
}

/// A square button with only an icon, named for screen readers.
export function IconButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => ({
        padding: theme.space(2),
        borderRadius: theme.radius.md,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      {icon}
    </Pressable>
  );
}
