import { IconSelector } from "@tabler/icons-react-native";
import { Children, cloneElement, isValidElement, type ReactNode, type RefObject } from "react";
import { Pressable, View } from "react-native";
import { Glyph } from "./kit/Glyph.tsx";
import { Label } from "./kit/Label.tsx";
import { useScheme, useSemantic, useSemanticPair } from "./kit/scheme.ts";
import { CORNER, RADIUS, SPACE, TINT } from "./tokens.ts";
import { usePropertyLook } from "./parts.tsx";
import { CONTROL_SIZE, LIST_ROW, MIN_TOUCH, touchSlop } from "./touch.ts";

/// An item's properties as rows, like the desktop's details: each row a name and its value,
/// hairlines between them, flat on the page. A row that can change opens its picker.
export function PropertyList({ children }: { children: ReactNode }) {
  const rows = Children.toArray(children);
  const separator = useSemantic("separator");
  if (usePropertyLook() === "chip") {
    return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm }}>{rows}</View>;
  }
  return (
    <View>
      {rows.map((row, index) => (
        <View
          // The rows are fixed in number and order.
          // oxlint-disable-next-line react/no-array-index-key
          key={index}
          style={
            index > 0
              ? { borderTopWidth: 0.5, borderTopColor: separator, marginLeft: 36 }
              : undefined
          }
        >
          {row}
        </View>
      ))}
    </View>
  );
}

/// A property at a glance: as tall as the desktop's property value (`h-7`) plus a little,
/// its hit area grown to a finger's.
const CHIP_HEIGHT = CONTROL_SIZE.chip;

/// A row's icon at a chip's size, the desktop's 16 points beside text.
function chipIcon(icon: ReactNode): ReactNode {
  return isValidElement<{ size?: number }>(icon) ? cloneElement(icon, { size: 16 }) : icon;
}

/// One property: an icon, its name, its value on the right. With `onPress` it opens its
/// picker (a sheet).
export function Property({
  icon,
  label,
  value,
  valueIcon,
  empty = false,
  valueTone,
  disabled = false,
  onPress,
  ref,
}: {
  /// What a compact menu opened from it sits beside.
  ref?: RefObject<View | null>;
  icon?: ReactNode;
  label: string;
  value: string;
  /// Shown beside the value (a status's symbol).
  valueIcon?: ReactNode;
  /// Nothing is set: a chip says the property's name, faded, rather than "None".
  empty?: boolean;
  /// The value in a colour that warns (a due date that has passed).
  valueTone?: "destructive";
  disabled?: boolean;
  onPress?: () => void;
}) {
  const scheme = useScheme();
  const fill = useSemantic("fill");
  const pressedFill = useSemantic("pressed");
  const muted = useSemanticPair("tertiaryLabel");
  const interactive = Boolean(onPress) && !disabled;
  const tint = valueTone === "destructive" ? TINT.red[scheme] : undefined;
  if (usePropertyLook() === "chip") {
    return (
      <Pressable
        ref={ref}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value}`}
        accessibilityState={{ disabled: !interactive }}
        disabled={!interactive}
        onPress={onPress}
        unstable_pressDelay={0}
        hitSlop={touchSlop(CHIP_HEIGHT, MIN_TOUCH)}
        style={({ pressed }) => [
          CORNER,
          {
            height: CHIP_HEIGHT,
            flexDirection: "row",
            alignItems: "center",
            gap: SPACE.xs + 2,
            paddingHorizontal: SPACE.md,
            borderRadius: RADIUS.pill,
            backgroundColor: pressed ? pressedFill : fill,
          },
        ]}
      >
        {valueIcon ?? chipIcon(icon)}
        <Label
          type="subheadline"
          weight="500"
          color={empty ? "secondaryLabel" : "label"}
          tint={empty ? undefined : tint}
          numberOfLines={1}
        >
          {empty ? label : value}
        </Label>
      </Pressable>
    );
  }
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      accessibilityState={{ disabled: !interactive }}
      disabled={!interactive}
      onPress={onPress}
      unstable_pressDelay={0}
      style={({ pressed }) => ({
        minHeight: LIST_ROW.minHeight,
        flexDirection: "row",
        alignItems: "center",
        gap: SPACE.md,
        paddingHorizontal: SPACE.xs,
        borderRadius: RADIUS.control,
        backgroundColor: pressed && interactive ? pressedFill : undefined,
      })}
    >
      {icon}
      <Label style={{ flex: 1 }} numberOfLines={1}>
        {label}
      </Label>
      {valueIcon}
      <Label color="secondaryLabel" tint={tint} numberOfLines={1} style={{ maxWidth: "55%" }}>
        {value}
      </Label>
      {interactive ? (
        <Glyph
          name="chevron.up.chevron.down"
          fallback={IconSelector}
          size={13}
          color={muted.color}
          hex={muted.hex}
          weight="semibold"
        />
      ) : null}
    </Pressable>
  );
}
