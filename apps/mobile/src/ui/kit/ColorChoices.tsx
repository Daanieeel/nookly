import { useState } from "react";
import { Pressable, View } from "react-native";
import { haptic } from "../haptics.ts";
import { MIN_TOUCH } from "../touch.ts";
import { useSemantic } from "./scheme.ts";

/// How big a colour's circle is, and the ring around the chosen one.
const DOT = 28;
const RING = 2;

/// Colours to pick from as iOS's Reminders offers a list's colour: a row of circles, the
/// chosen one ringed, each in a cell a finger can hit. `none` adds a hollow circle first for
/// no colour at all.
export function ColorChoices({
  label,
  colors,
  value,
  onChange,
  none,
}: {
  label: string;
  colors: readonly string[];
  value: string | null;
  onChange: (color: string | null) => void;
  /// What the choice of no colour is called (`No tint`); leaves it out when unset.
  none?: string;
}) {
  const choices: (string | null)[] = none ? [null, ...colors] : [...colors];
  // As many even columns as fit a finger wide each, so the rows line up as a grid.
  const [width, setWidth] = useState(0);
  const columns = Math.max(1, Math.floor(width / MIN_TOUCH));
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ flexDirection: "row", flexWrap: "wrap" }}
    >
      {choices.map((color) => (
        <Choice
          key={color ?? "none"}
          share={width > 0 ? `${100 / columns}%` : undefined}
          label={color === null ? (none ?? "None") : `${label} ${color}`}
          color={color}
          selected={color === value}
          onPress={() => {
            haptic("select");
            if (color !== value) onChange(color);
          }}
        />
      ))}
    </View>
  );
}

function Choice({
  share,
  label,
  color,
  selected,
  onPress,
}: {
  /// The cell's share of the row; a finger wide until the row is measured.
  share?: `${number}%`;
  label: string;
  color: string | null;
  selected: boolean;
  onPress: () => void;
}) {
  const separator = useSemantic("separator");
  const ring = useSemantic("tertiaryLabel");
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      unstable_pressDelay={0}
      style={({ pressed }) => [
        { width: share ?? MIN_TOUCH, height: MIN_TOUCH },
        pressed && { opacity: 0.6 },
      ]}
    >
      {({ pressed }) => (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.6 : 1,
          }}
        >
          <View
            style={{
              width: DOT + RING * 4,
              height: DOT + RING * 4,
              borderRadius: DOT,
              borderWidth: RING,
              borderColor: selected ? ring : "transparent",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              style={{
                width: DOT,
                height: DOT,
                borderRadius: DOT / 2,
                backgroundColor: color ?? undefined,
                borderWidth: color ? 0 : 1.5,
                borderColor: separator,
              }}
            />
          </View>
        </View>
      )}
    </Pressable>
  );
}
