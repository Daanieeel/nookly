import { IconChevronRight } from "@tabler/icons-react-native";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { AnimatedPressable, usePressScale } from "../press.ts";
import { MIN_TOUCH } from "../touch.ts";
import { CORNER, RADIUS, SPACE, type TintName } from "../tokens.ts";
import type { GlyphIcon } from "./Glyph.tsx";
import { IconBadge } from "./IconBadge.tsx";
import { Label } from "./Label.tsx";
import { useSemantic, useSemanticPair, useSurface } from "./scheme.ts";

/// A raised, rounded card that is one big button, as a Home Screen widget is: it gives way
/// under the finger and darkens the moment it lands.
export function Tile({
  accessibilityLabel,
  onPress,
  padding = SPACE.md,
  children,
}: {
  accessibilityLabel: string;
  onPress: () => void;
  padding?: number;
  children: ReactNode;
}) {
  const surface = useSurface();
  const pressedFill = useSemantic("pressed");
  const press = usePressScale();
  return (
    <Animated.View style={[{ flex: 1 }, press.style]}>
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        unstable_pressDelay={0}
        style={[
          CORNER,
          {
            flex: 1,
            minHeight: MIN_TOUCH,
            borderRadius: RADIUS.section,
            padding,
            backgroundColor: surface,
            overflow: "hidden",
          },
        ]}
      >
        {({ pressed }) => (
          <>
            {pressed ? (
              <View
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, { backgroundColor: pressedFill }]}
              />
            ) : null}
            {children}
          </>
        )}
      </AnimatedPressable>
    </Animated.View>
  );
}

/// Something to make in one tap: the desktop's icon for it on its tint, its name under it.
export function ActionTile({
  glyph,
  tint,
  label,
  accessibilityLabel,
  onPress,
}: {
  glyph: GlyphIcon;
  tint: TintName;
  label: string;
  /// Read out instead of the short label ("New Task" for "Task").
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Tile accessibilityLabel={accessibilityLabel} onPress={onPress} padding={SPACE.sm}>
      <View style={{ alignItems: "center", gap: SPACE.xs, paddingVertical: SPACE.xs }}>
        <IconBadge glyph={glyph} tint={tint} size={40} />
        <Label type="footnote" weight="500" numberOfLines={1}>
          {label}
        </Label>
      </View>
    </Tile>
  );
}

/// How many of something wait, as a widget shows it: the badge and a chevron, the count big,
/// its name and a line of detail under it. Pressed, it opens the list it counts.
export function CountTile({
  glyph,
  tint,
  title,
  count,
  detail,
  onPress,
}: {
  glyph: GlyphIcon;
  tint: TintName;
  title: string;
  count: number;
  detail: string;
  onPress: () => void;
}) {
  const muted = useSemanticPair("tertiaryLabel");
  return (
    <Tile accessibilityLabel={`${title}, ${count}, ${detail}`} onPress={onPress}>
      <View style={{ gap: SPACE.xxs }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: SPACE.xs,
          }}
        >
          <IconBadge glyph={glyph} tint={tint} />
          <IconChevronRight size={16} color={muted.hex} />
        </View>
        <Label type="title1" style={{ fontVariant: ["tabular-nums"] }}>
          {count}
        </Label>
        <Label type="subheadline" weight="600" numberOfLines={1}>
          {title}
        </Label>
        <Label type="footnote" color="secondaryLabel" numberOfLines={1}>
          {detail}
        </Label>
      </View>
    </Tile>
  );
}
