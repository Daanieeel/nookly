import { type Insets, Platform } from "react-native";

/// Sizes for fingers. The phone draws the desktop's controls at the desktop's size, and
/// these make each one big enough to hit: what can grow does, the rest gets a larger hit
/// area around it (`touchSlop`).

/// The smallest a finger target may be: 44 points on iOS, 48 on Android, each platform's
/// own guideline.
export const MIN_TOUCH = Platform.OS === "android" ? 48 : 44;

/// The room between two neighbouring controls of `size` points (icon buttons side by side,
/// wrapped chips), so the larger hit areas around them never overlap.
export const gapBetween = (size: number) => Math.max(0, MIN_TOUCH - size);

/// `gapBetween` for chips and small buttons, the most common neighbours.
export const TOUCH_GAP = gapBetween(32);

/// The size each of the desktop's controls is drawn at on the phone, in points: the
/// desktop's look, at a finger's size. iOS draws its own buttons this big, so ours are too,
/// not only their hit areas (the desktop's 36 point button looked tiny on a phone).
export const CONTROL_SIZE = {
  /// `buttonVariants` sizes, drawn this tall.
  default: 44,
  sm: 36,
  lg: 50,
  icon: 44,
  iconSm: 36,
  /// A chip is a small button.
  chip: 36,
  /// `COLOR_SWATCH_CLASSES`.
  swatch: 28,
  /// A round checkbox in a row.
  check: 24,
} as const;

/// The hit slop that grows a control of `height` by `width` points to `MIN_TOUCH` each way.
export function touchSlop(height: number, width = height): Insets {
  const vertical = Math.max(0, Math.ceil((MIN_TOUCH - height) / 2));
  const horizontal = Math.max(0, Math.ceil((MIN_TOUCH - width) / 2));
  return { top: vertical, bottom: vertical, left: horizontal, right: horizontal };
}

/// The height of anything tapped as a whole: a field, a row, a menu item.
export const TOUCH_ROW = { minHeight: MIN_TOUCH };

/// A field's height: the desktop's input, tall enough for a finger.
export const FIELD_HEIGHT = { height: MIN_TOUCH };
