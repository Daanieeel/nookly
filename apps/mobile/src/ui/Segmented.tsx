import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { haptic } from "./haptics.ts";
import { Label } from "./kit/Label.tsx";
import { useScheme, useSemantic } from "./kit/scheme.ts";
import { SPRING } from "./motion.ts";
import { useReduceMotion } from "./reduce-motion.ts";
import { CORNER, DEPTH, SEGMENT_THUMB } from "./tokens.ts";
import { MIN_TOUCH } from "./touch.ts";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

/// Room between the track and the chosen segment.
const INSET = 2;

/// A few choices side by side, Linear's tab pills (D65): a quiet rounded track, the chosen
/// one on a raised pill with a hairline edge and a soft shadow that springs across to the
/// next choice, the others in muted text. As tall as a finger needs, each choice an equal
/// share of the width.
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (next: T) => void;
}) {
  const scheme = useScheme();
  const track = useSemantic("fill");
  const edge = useSemantic("separator");
  const reduce = useReduceMotion();
  const [width, setWidth] = useState(0);
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const segment = width > 0 ? (width - INSET * 2) / options.length : 0;
  const x = useSharedValue(index * segment);
  useEffect(() => {
    const to = index * segment;
    x.value = reduce || segment === 0 ? to : withSpring(to, SPRING.press);
  }, [index, segment, reduce, x]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[
        CORNER,
        {
          height: MIN_TOUCH,
          width: "100%",
          flexDirection: "row",
          padding: INSET,
          borderRadius: MIN_TOUCH / 2,
          backgroundColor: track,
        },
      ]}
    >
      {segment > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            CORNER,
            DEPTH.raised,
            {
              position: "absolute",
              top: INSET,
              bottom: INSET,
              left: INSET,
              width: segment,
              borderRadius: MIN_TOUCH / 2,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: edge,
              backgroundColor: SEGMENT_THUMB[scheme],
            },
            thumb,
          ]}
        />
      ) : null}
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={option.label}
            unstable_pressDelay={0}
            onPress={() => {
              if (!selected) haptic("select");
              onChange(option.value);
            }}
            style={({ pressed }) => ({
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              paddingHorizontal: 8,
              opacity: pressed && !selected ? 0.55 : 1,
            })}
          >
            {option.icon}
            <Label
              type="subheadline"
              weight={selected ? "600" : "500"}
              color={selected ? "label" : "secondaryLabel"}
              numberOfLines={1}
              // As iOS's segmented control: the labels grow less than body text and shrink
              // to fit rather than cut a word off.
              maxFontSizeMultiplier={1.5}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {option.label}
            </Label>
          </Pressable>
        );
      })}
    </View>
  );
}
