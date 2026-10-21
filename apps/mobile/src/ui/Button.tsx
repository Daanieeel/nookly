import { buttonVariants } from "@nookly/ui/classes";
import { IconAlertTriangle, IconCheck } from "@tabler/icons-react-native";
import type { VariantProps } from "class-variance-authority";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, type PressableProps, View } from "react-native";
import { cn, row, splitText } from "./classes.ts";
import { Text } from "./Text.tsx";
import { useTheme } from "./theme.ts";

export type ButtonStatus = "idle" | "pending" | "success" | "error";
type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;
type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>;

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

/// The color of a variant's text, for the spinner and icons beside it.
function useForeground(variant: ButtonVariant): string {
  const { colors } = useTheme();
  if (variant === "default") return colors.primaryForeground;
  if (variant === "destructive") return colors.destructive;
  if (variant === "positive") return colors.positive;
  if (variant === "link") return colors.primary;
  if (variant === "muted" || variant === "linkMuted") return colors.mutedForeground;
  return colors.foreground;
}

interface ButtonProps extends Omit<PressableProps, "children"> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  status?: ButtonStatus;
  successLabel?: string;
  errorLabel?: string;
  icon?: React.ReactNode;
  className?: string;
}

/// The desktop's `Button`, with its variants and sizes (`buttonVariants`). It shows the
/// result on itself, as on the desktop: a spinner while pending, a check for two
/// seconds on success, a warning that stays on error.
export function Button({
  label,
  variant = "default",
  size = "default",
  status = "idle",
  successLabel,
  errorLabel,
  icon,
  disabled,
  className,
  ...props
}: ButtonProps) {
  const theme = useTheme();
  const foreground = useForeground(variant);
  const [showSuccess, setShowSuccess] = useState(false);
  useEffect(() => {
    if (status !== "success") return;
    setShowSuccess(true);
    const timer = setTimeout(() => setShowSuccess(false), 2000);
    return () => clearTimeout(timer);
  }, [status]);
  const { box, text } = splitText(row(buttonVariants({ variant, size, className })));
  const shown =
    status === "error" ? (errorLabel ?? label) : showSuccess ? (successLabel ?? label) : label;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={shown}
      accessibilityState={{ disabled: !!disabled, busy: status === "pending" }}
      disabled={disabled || status === "pending"}
      hitSlop={4}
      {...props}
      className={cn(box, "active:opacity-80")}
    >
      {status === "pending" ? (
        <ActivityIndicator size="small" color={foreground} />
      ) : status === "error" ? (
        <IconAlertTriangle size={16} color={theme.colors.destructive} />
      ) : showSuccess ? (
        <IconCheck size={16} color={variant === "default" ? foreground : theme.colors.positive} />
      ) : (
        icon
      )}
      {/* The words never take the touch, so a press on them reaches the button. */}
      <View pointerEvents="none">
        <Text
          className={cn(text, status === "error" && variant !== "default" && "text-destructive")}
        >
          {shown}
        </Text>
      </View>
    </Pressable>
  );
}

/// The desktop's icon button: `ghost`, `icon` sized, named for screen readers (the
/// phone's stand in for a tooltip).
export function IconButton({
  label,
  icon,
  onPress,
  size = "icon",
}: {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  size?: "icon" | "iconSm";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      className={cn(row(buttonVariants({ variant: "ghost", size })), "active:bg-accent")}
    >
      <View pointerEvents="none">{icon}</View>
    </Pressable>
  );
}
