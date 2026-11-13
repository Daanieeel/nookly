import { buttonVariants } from "@nookly/ui/classes";
import { IconAlertTriangle, IconCheck } from "@tabler/icons-react-native";
import type { VariantProps } from "class-variance-authority";
import { useEffect, useState } from "react";
import { ActivityIndicator, type PressableProps, View } from "react-native";
import { Label } from "./kit/Label.tsx";
import { useScheme } from "./kit/scheme.ts";
import { CORNER, RADIUS, SPACE, TINT, TINT_FILL, semanticHex, withAlpha } from "./tokens.ts";
import { CONTROL_SIZE, MIN_TOUCH, touchSlop } from "./touch.ts";
import { AnimatedPressable, usePressScale } from "./press.ts";
import { haptic } from "./haptics.ts";

export type ButtonStatus = "idle" | "pending" | "success" | "error";
type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;
type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>;

/// A size's hit area: tall enough for a finger, and wide enough too for an icon button.
const slopFor = (size: ButtonSize) =>
  size === "icon" || size === "iconSm"
    ? touchSlop(CONTROL_SIZE[size])
    : touchSlop(CONTROL_SIZE[size], MIN_TOUCH);

/// How big a button of `size` is drawn: an icon button square, the others this tall.
const drawnAt = (size: ButtonSize) =>
  size === "icon" || size === "iconSm"
    ? { width: CONTROL_SIZE[size], height: CONTROL_SIZE[size] }
    : { height: CONTROL_SIZE[size] };

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

/// How a variant is drawn on the phone (D53): iOS's button styles in Nookly's colours. The
/// main action is filled with the accent; the rest are tinted or gray capsules, or only
/// words, as iOS draws a prominent, a tinted, a gray and a plain button.
interface Look {
  fill?: string;
  text: string;
  border?: string;
  weight: "500" | "600";
}

function useLook(variant: ButtonVariant): Look {
  const scheme = useScheme();
  const fill = semanticHex("fill", scheme);
  const label = semanticHex("label", scheme);
  const muted = semanticHex("secondaryLabel", scheme);
  const separator = semanticHex("separator", scheme);
  const tinted = (name: "blue" | "red" | "green" | "yellow"): Look => ({
    fill: withAlpha(TINT[name][scheme], TINT_FILL[scheme]),
    text: TINT[name][scheme],
    weight: "600",
  });
  switch (variant) {
    case "default":
      return { fill: TINT.blue[scheme], text: "#ffffff", weight: "600" };
    case "destructive":
      return tinted("red");
    case "positive":
      return tinted("green");
    case "warning":
    case "caution":
      return tinted("yellow");
    case "secondary":
    case "neutral":
      return { fill, text: label, weight: "600" };
    case "outline":
      return { border: separator, text: label, weight: "600" };
    case "link":
      return { text: TINT.blue[scheme], weight: "500" };
    case "muted":
    case "linkMuted":
      return { text: muted, weight: "500" };
    default:
      return { text: label, weight: "500" };
  }
}

interface ButtonProps extends Omit<PressableProps, "children" | "style"> {
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
  const scheme = useScheme();
  const look = useLook(variant);
  const red = TINT.red[scheme];
  const green = TINT.green[scheme];
  const press = usePressScale();
  const [showSuccess, setShowSuccess] = useState(false);
  useEffect(() => {
    if (status === "error") haptic("error");
    if (status !== "success") return;
    haptic("success");
    setShowSuccess(true);
    const timer = setTimeout(() => setShowSuccess(false), 2000);
    return () => clearTimeout(timer);
  }, [status]);
  const shown =
    status === "error" ? (errorLabel ?? label) : showSuccess ? (successLabel ?? label) : label;
  const small = size === "sm";
  const words = variant === "link" || variant === "linkMuted";
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={shown}
      accessibilityState={{ disabled: !!disabled, busy: status === "pending" }}
      disabled={disabled || status === "pending"}
      hitSlop={slopFor(size)}
      unstable_pressDelay={0}
      {...props}
      onPressIn={(event) => {
        press.onPressIn();
        props.onPressIn?.(event);
      }}
      onPressOut={(event) => {
        press.onPressOut();
        props.onPressOut?.(event);
      }}
      style={[
        drawnAt(size),
        CORNER,
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: SPACE.sm - 2,
          paddingHorizontal: words ? 0 : small ? SPACE.md + 2 : SPACE.xl,
          borderRadius: RADIUS.pill,
          backgroundColor: look.fill,
          borderWidth: look.border ? 1 : 0,
          borderColor: look.border,
          opacity: disabled ? 0.4 : 1,
        },
        press.style,
      ]}
      className={className}
    >
      {status === "pending" ? (
        <ActivityIndicator size="small" color={look.text} />
      ) : status === "error" ? (
        <IconAlertTriangle size={16} color={variant === "default" ? look.text : red} />
      ) : showSuccess ? (
        <IconCheck size={16} color={variant === "default" ? look.text : green} />
      ) : (
        icon
      )}
      {/* The words never take the touch, so a press on them reaches the button. */}
      <View pointerEvents="none">
        <Label
          type={small ? "subheadline" : "body"}
          weight={look.weight}
          tint={status === "error" && variant !== "default" ? red : look.text}
          numberOfLines={1}
        >
          {shown}
        </Label>
      </View>
    </AnimatedPressable>
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
  const press = usePressScale();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={slopFor(size)}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      unstable_pressDelay={0}
      style={[
        drawnAt(size),
        { alignItems: "center", justifyContent: "center", borderRadius: RADIUS.pill },
        press.style,
      ]}
    >
      <View pointerEvents="none">{icon}</View>
    </AnimatedPressable>
  );
}
