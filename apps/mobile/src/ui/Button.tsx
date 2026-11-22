import { buttonVariants } from "@nookly/ui/classes";
import { IconAlertTriangle, IconCheck } from "@tabler/icons-react-native";
import type { VariantProps } from "class-variance-authority";
import { cloneElement, isValidElement, useEffect, useState } from "react";
import {
  ActivityIndicator,
  type PressableProps,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import { PointerStyle } from "../../modules/nookly-window/src/PointerStyle.tsx";
import { Label } from "./kit/Label.tsx";
import { useScheme } from "./kit/scheme.ts";
import {
  CORNER,
  PRIMARY,
  PRIMARY_GLOSS,
  RADIUS,
  SOLID,
  type SolidName,
  SPACE,
  TINT,
  elevation,
  semanticHex,
  solidLook,
} from "./tokens.ts";
import { CONTROL_SIZE, MIN_TOUCH, touchSlop } from "./touch.ts";
import { AnimatedPressable, usePressScale } from "./press.ts";
import { useIsTablet } from "./pane.tsx";
import { type HapticName, haptic } from "./haptics.ts";

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

/// How pressing a variant feels: a thud to commit, a firm one for something with consequences,
/// a plain tap for a neutral button and the lightest tick for the quiet ones.
function pressHaptic(variant: ButtonVariant): HapticName {
  switch (variant) {
    case "default":
    case "positive":
      return "detent";
    case "destructive":
    case "destructiveGhost":
    case "warning":
    case "caution":
      return "edge";
    case "secondary":
    case "neutral":
    case "outline":
      return "tap";
    default:
      return "select";
  }
}

/// How a variant is drawn on the phone (D53): iOS's button styles in Nookly's colours. The
/// main action is filled with the accent; the rest are tinted or gray capsules, or only
/// words, as iOS draws a prominent, a tinted, a gray and a plain button.
interface Look {
  fill?: string;
  text: string;
  border?: string;
  weight: "500" | "600";
  /// The depth the desktop's button of this variant has: a gloss, a ring and shadows.
  depth?: ViewStyle;
  /// Drawn on a filled colour, so its icons are the label's colour too.
  filled?: boolean;
}

function useLook(variant: ButtonVariant): Look {
  const scheme = useScheme();
  const raised = semanticHex("raised", scheme);
  const edge = semanticHex("controlEdge", scheme);
  const label = semanticHex("label", scheme);
  const muted = semanticHex("secondaryLabel", scheme);
  const separator = semanticHex("separator", scheme);
  const solid = (name: SolidName): Look => ({
    fill: SOLID[name][scheme],
    text: "#ffffff",
    weight: "600",
    depth: solidLook(SOLID[name][scheme], scheme),
    filled: true,
  });
  switch (variant) {
    case "default":
      return {
        fill: PRIMARY,
        text: "#ffffff",
        weight: "600",
        depth: PRIMARY_GLOSS,
        filled: true,
      };
    case "destructive":
      return solid("destructive");
    case "positive":
      return solid("positive");
    case "warning":
      return solid("warning");
    case "caution":
      return solid("caution");
    case "secondary":
    case "neutral":
      return {
        fill: raised,
        text: label,
        border: edge,
        weight: "600",
        depth: elevation("control", scheme),
      };
    case "outline":
      return { border: separator, text: label, weight: "600" };
    case "link":
      return { text: TINT.blue[scheme], weight: "500" };
    case "destructiveGhost":
      return { text: TINT.red[scheme], weight: "500" };
    case "muted":
    case "linkMuted":
      return { text: muted, weight: "500" };
    default:
      return { text: label, weight: "500" };
  }
}

/// A button's icon is drawn in its label's colour, whatever colour the caller gave it: a
/// trash icon in a red button is white, like the words beside it.
function withLabelColor(icon: React.ReactNode, color: string): React.ReactNode {
  return isValidElement<{ color?: string }>(icon) ? cloneElement(icon, { color }) : icon;
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
      onPress={(event) => {
        haptic(pressHaptic(variant));
        props.onPress?.(event);
      }}
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
          borderRadius: RADIUS.control,
          backgroundColor: look.fill,
          borderWidth: look.border ? 1 : 0,
          borderColor: look.border,
          opacity: disabled ? 0.4 : 1,
        },
        look.depth,
        press.style,
      ]}
      className={className}
    >
      {status === "pending" ? (
        <ActivityIndicator size="small" color={look.text} />
      ) : status === "error" ? (
        <IconAlertTriangle size={16} color={look.filled ? look.text : red} />
      ) : showSuccess ? (
        <IconCheck size={16} color={look.filled ? look.text : green} />
      ) : (
        withLabelColor(icon, look.text)
      )}
      {/* The words never take the touch, so a press on them reaches the button. */}
      <View pointerEvents="none">
        <Label
          type={small ? "subheadline" : "body"}
          weight={look.weight}
          tint={status === "error" && !look.filled ? red : look.text}
          numberOfLines={1}
        >
          {shown}
        </Label>
      </View>
    </AnimatedPressable>
  );
}

/// The desktop's icon button: `ghost`, `icon` sized, named for screen readers (the
/// phone's stand in for a tooltip). `secondary` draws it on a gray circle, for one that has
/// to be found and hit at a glance.
export function IconButton({
  label,
  icon,
  onPress,
  size = "icon",
  variant = "ghost",
  disabled = false,
}: {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  size?: "icon" | "iconSm";
  variant?: "ghost" | "secondary" | "default";
  /// Drawn faded and not pressable, for an action that would do nothing now.
  disabled?: boolean;
}) {
  const press = usePressScale();
  const secondary = useLook("secondary");
  const main = useLook("default");
  const tablet = useIsTablet();
  const round = variant === "secondary" ? CONTROL_SIZE[size] / 2 : RADIUS.control;
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={slopFor(size)}
      onPress={() => {
        haptic(variant === "default" ? "detent" : variant === "secondary" ? "tap" : "select");
        onPress();
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      unstable_pressDelay={0}
      style={[
        drawnAt(size),
        CORNER,
        { alignItems: "center", justifyContent: "center", borderRadius: RADIUS.control },
        variant === "secondary" && {
          backgroundColor: secondary.fill,
          borderWidth: 1,
          borderColor: secondary.border,
          borderRadius: CONTROL_SIZE[size] / 2,
          ...secondary.depth,
        },
        // The main action as a square: the accent, glossy, as a `default` button.
        variant === "default" && { backgroundColor: main.fill, ...main.depth },
        disabled && { opacity: 0.35 },
        press.style,
      ]}
    >
      {/* A tablet's pointer lifts or lights up the button, as iPadOS's own (D100). */}
      {tablet ? <PointerStyle effect="button" cornerRadius={round} style={FILL} /> : null}
      <View pointerEvents="none">{icon}</View>
    </AnimatedPressable>
  );
}

const FILL = StyleSheet.absoluteFill;
