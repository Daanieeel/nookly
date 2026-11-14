import { IconCheck, IconSelector } from "@tabler/icons-react-native";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { BlurView } from "expo-blur";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { haptic } from "../haptics.ts";
import { FADE, SPRING } from "../motion.ts";
import { useReduceMotion } from "../reduce-motion.ts";
import { Text } from "../Text.tsx";
import { useTheme } from "../theme.ts";
import { CORNER, DEPTH, TYPE } from "../tokens.ts";
import { MIN_TOUCH } from "../touch.ts";
import type { Option } from "./OptionList.tsx";

const BODY = { fontSize: TYPE.body.fontSize, lineHeight: TYPE.body.lineHeight };
const MENU_WIDTH = 250;
const MENU_ROW = 44;
const RADIUS = 22;

/// The menu's top left corner on the screen.
export interface MenuPlace {
  left: number;
  top: number;
}

/// Where the menu goes: under the value it opens from, its right edge on the value's, or
/// over it when there is no room below. Kept inside the screen.
export function placeMenu({
  anchor,
  window,
  count,
}: {
  anchor: { x: number; y: number; width: number; height: number };
  window: { width: number; height: number };
  count: number;
}): MenuPlace {
  const height = count * MENU_ROW + 16;
  const left = Math.max(
    12,
    Math.min(anchor.x + anchor.width - MENU_WIDTH, window.width - MENU_WIDTH - 12),
  );
  const below = anchor.y + anchor.height + 6;
  const top = below + height <= window.height - 24 ? below : Math.max(24, anchor.y - height - 6);
  return { left, top };
}

/// Linear's select in a grouped row (D65): the name on the left, the value with an up and
/// down chevron on the right; tapped, a blurred menu grows out of it with the choices, a
/// check before the chosen one. A tap outside or on a choice closes it.
export function InlineSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (id: T) => void;
}) {
  const theme = useTheme();
  const window = useWindowDimensions();
  const anchorRef = useRef<View>(null);
  const [place, setPlace] = useState<MenuPlace | null>(null);
  const current = options.find((o) => o.id === value);
  const open = () => {
    haptic("select");
    const node = anchorRef.current;
    const fallback = {
      left: window.width - MENU_WIDTH - 12,
      top: window.height / 3,
    };
    if (!node?.measureInWindow) return setPlace(fallback);
    // Where the value is comes back on the next frame; a host that never answers (a test)
    // gets the menu in the middle.
    let answered = false;
    setTimeout(() => {
      if (!answered) setPlace(fallback);
    }, 80);
    node.measureInWindow((x, y, width, height) => {
      answered = true;
      const measured = Number.isFinite(x) && width > 0;
      setPlace(
        measured
          ? placeMenu({
              anchor: { x, y, width, height },
              window,
              count: options.length,
            })
          : fallback,
      );
    });
  };
  return (
    <>
      <Pressable
        ref={anchorRef}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${current?.label ?? ""}`}
        onPress={open}
        style={{ minHeight: MIN_TOUCH + 8 }}
        className="flex-row items-center gap-3 px-4 active:opacity-60"
      >
        <Text className="flex-1" style={BODY}>
          {label}
        </Text>
        <Text numberOfLines={1} tone="muted" style={[BODY, { maxWidth: "55%" }]}>
          {current?.label ?? ""}
        </Text>
        <IconSelector size={16} color={theme.colors.mutedForeground} />
      </Pressable>
      {place ? (
        <FloatingMenu
          label={label}
          place={place}
          options={options}
          value={value}
          onClose={() => setPlace(null)}
          onPick={(id) => {
            haptic("select");
            if (id !== value) onChange(id);
            setPlace(null);
          }}
        />
      ) : null}
    </>
  );
}

function FloatingMenu<T extends string>({
  label,
  place,
  options,
  value,
  onClose,
  onPick,
}: {
  label: string;
  place: MenuPlace;
  options: Option<T>[];
  value: T;
  onClose: () => void;
  onPick: (id: T) => void;
}) {
  const theme = useTheme();
  const still = useReduceMotion();
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.value = still ? withTiming(1, { duration: FADE.in }) : withSpring(1, SPRING.menu);
  }, [shown, still]);
  const style = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ scale: 0.85 + 0.15 * shown.value }],
  }));
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close Menu"
        onPress={onClose}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View
        accessibilityRole="menu"
        accessibilityLabel={label}
        style={[
          style,
          CORNER,
          DEPTH.floating,
          {
            position: "absolute",
            left: place.left,
            top: place.top,
            width: MENU_WIDTH,
            borderRadius: RADIUS,
            paddingVertical: 8,
            transformOrigin: "top right",
          },
        ]}
      >
        <BlurView
          tint="systemChromeMaterial"
          intensity={100}
          style={[StyleSheet.absoluteFill, CORNER, { borderRadius: RADIUS, overflow: "hidden" }]}
        />
        {options.map((option) => {
          const on = option.id === value;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="menuitem"
              accessibilityLabel={option.label}
              accessibilityState={{ checked: on }}
              onPress={() => onPick(option.id)}
              style={{ minHeight: MENU_ROW }}
              className="flex-row items-center gap-2 px-3 active:bg-accent"
            >
              <View style={{ width: 22 }}>
                {on ? <IconCheck size={18} color={theme.colors.foreground} /> : null}
              </View>
              <Text numberOfLines={1} className="flex-1" style={BODY}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </Animated.View>
    </Modal>
  );
}
