import { IconChevronLeft, IconX } from "@tabler/icons-react-native";
import { BlurView } from "expo-blur";
import { type ReactNode, useEffect, useState } from "react";
import { Keyboard, Pressable, StyleSheet, View } from "react-native";
import Animated, {
  type useAnimatedScrollHandler,
  useAnimatedKeyboard,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { IconButton } from "../Button.tsx";
import { GroupWidthProvider, useWindowSize } from "../pane.tsx";
import { Text } from "../Text.tsx";
import { useTheme } from "../theme.ts";
import { CARD_INSET, CORNER, DEPTH, RADIUS, SPACE } from "../tokens.ts";
import { MIN_TOUCH } from "../touch.ts";
import { useSemantic } from "../kit/scheme.ts";
import { type Anchor, anchorRect } from "./anchor.ts";
import { type PinStore, PinnedSlot } from "./pins.tsx";
import { type Placement, type Rect, placePopover } from "./placement.ts";

/// The parts of a floating sheet (D65's card on a phone; a dialog or popover on a tablet,
/// D83): the blurred surface with its hairline border, the title row, the pinned slot, the
/// scrolling content and the pinned footer.

const SURFACE_RADIUS = RADIUS.card;
type ScrollHandler = ReturnType<typeof useAnimatedScrollHandler>;
/// The room a dialog keeps to the window's edges.
const DIALOG_MARGIN = 24;

/// The surface's material and border, behind its content.
function Surface() {
  return (
    <>
      <BlurView
        tint="systemThickMaterial"
        intensity={100}
        style={[
          StyleSheet.absoluteFill,
          CORNER,
          { borderRadius: SURFACE_RADIUS, overflow: "hidden" },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          CORNER,
          { borderRadius: SURFACE_RADIUS, borderWidth: StyleSheet.hairlineWidth },
        ]}
        className="border-border"
      />
    </>
  );
}

export interface PanelParts {
  title?: string;
  /// Whether a step is pushed (a back button shows).
  stepped: boolean;
  onBack(): void;
  onClose(): void;
  pin: PinStore;
  /// What the content put in place of the title row (a compose form's own row).
  header?: ReactNode;
  footer: ReactNode;
  onScroll: ScrollHandler;
  children: ReactNode;
}

/// A card's or dialog's insides: a title row with the round close button, then the pinned
/// slot, the content scrolling, and the footer pinned under it.
export function CardPanel({
  title,
  stepped,
  onBack,
  onClose,
  pin,
  header,
  footer,
  onScroll,
  children,
}: PanelParts) {
  const theme = useTheme();
  return (
    <>
      <Surface />
      {header && !stepped ? (
        header
      ) : (
        <View
          testID="card-header"
          className="flex-row items-center gap-1"
          // As much room under the close button as above and beside it. The title starts
          // where the rows' content does: their pressed shapes start `CARD_INSET` in and
          // pad 12pt.
          style={{
            paddingLeft: CARD_INSET + SPACE.md,
            paddingTop: CARD_INSET,
            paddingRight: CARD_INSET,
            paddingBottom: CARD_INSET,
          }}
        >
          {stepped ? (
            <View className="-ml-3">
              <IconButton
                label="Back"
                icon={<IconChevronLeft size={20} color={theme.colors.foreground} />}
                onPress={onBack}
              />
            </View>
          ) : null}
          <Text variant="heading" accessibilityRole="header" numberOfLines={1} className="flex-1">
            {title ?? ""}
          </Text>
          <RoundButton label="Close" onPress={onClose}>
            <IconX size={22} color={theme.colors.foreground} />
          </RoundButton>
        </View>
      )}
      <Body pin={pin} footer={stepped ? null : footer} onScroll={onScroll}>
        {children}
      </Body>
    </>
  );
}

/// Linear's round button in a sheet's or card's corners (close, send): a filled circle a
/// finger tall.
export function RoundButton({
  label,
  onPress,
  disabled,
  tone = "plain",
  children,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /// `primary` fills it with the accent (a send that is ready).
  tone?: "plain" | "primary";
  children: ReactNode;
}) {
  const fill = useSemantic("fill");
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        CORNER,
        {
          width: MIN_TOUCH,
          height: MIN_TOUCH,
          borderRadius: RADIUS.control,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: tone === "primary" && !disabled ? theme.colors.primary : fill,
          opacity: disabled ? 0.45 : pressed ? 0.6 : 1,
        },
      ]}
    >
      {children}
    </Pressable>
  );
}

/// The pinned slot, the scrolling content and the pinned footer.
function Body({
  pin,
  footer,
  onScroll,
  children,
}: {
  pin: PinStore;
  footer: ReactNode;
  onScroll: ScrollHandler;
  children: ReactNode;
}) {
  return (
    <>
      <PinnedSlot store={pin} inset={CARD_INSET} />
      <Animated.ScrollView
        testID="card-body"
        bounces={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={onScroll}
        style={{ flexGrow: 0, flexShrink: 1 }}
        contentContainerStyle={{ paddingHorizontal: CARD_INSET, paddingBottom: CARD_INSET }}
      >
        {children}
      </Animated.ScrollView>
      {footer ? (
        <View
          testID="card-footer"
          style={{ paddingHorizontal: CARD_INSET, paddingTop: SPACE.xs, paddingBottom: CARD_INSET }}
        >
          {footer}
        </View>
      ) : null}
    </>
  );
}

/// A tap outside: closes, and never reaches what is under it.
function Outside({
  dim,
  onPress,
  shown,
}: {
  dim: boolean;
  onPress: () => void;
  shown: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => ({ opacity: shown.value }));
  return (
    <Animated.View
      style={style}
      className={dim ? "absolute inset-0 bg-black/40" : "absolute inset-0"}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onPress}
        className="flex-1"
      />
    </Animated.View>
  );
}

/// A tablet dialog (2.2): centred over the dimmed page, `width` wide (never wider than the
/// window less 24 a side), never taller than the window less 48; it moves up with the
/// keyboard, then shrinks.
export function DialogFrame({
  width,
  title,
  shown,
  onRequestClose,
  children,
}: {
  width: number;
  title?: string;
  shown: SharedValue<number>;
  onRequestClose: () => void;
  children: ReactNode;
}) {
  const window = useWindowSize();
  const keyboard = useAnimatedKeyboard();
  const room = useAnimatedStyle(() => ({
    paddingBottom: Math.max(DIALOG_MARGIN, keyboard.height.value + SPACE.md),
  }));
  const grow = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ scale: 0.96 + 0.04 * shown.value }],
  }));
  return (
    <Animated.View
      style={[room, { paddingTop: DIALOG_MARGIN }]}
      className="flex-1 items-center justify-center"
    >
      <Outside dim onPress={onRequestClose} shown={shown} />
      <Animated.View
        testID="sheet-dialog"
        accessibilityViewIsModal
        onAccessibilityEscape={onRequestClose}
        accessibilityLabel={title}
        style={[
          grow,
          CORNER,
          DEPTH.floating,
          {
            width: Math.min(width, window.width - 2 * DIALOG_MARGIN),
            maxHeight: "100%",
            borderRadius: SURFACE_RADIUS,
          },
        ]}
      >
        {/* A page drawn in a dialog lays out for the dialog, not the window behind it. */}
        <GroupWidthProvider value={Math.min(width, window.width - 2 * DIALOG_MARGIN)}>
          {children}
        </GroupWidthProvider>
      </Animated.View>
    </Animated.View>
  );
}

/// The software keyboard's height over the window, for placing a popover above it, and a
/// count that goes up each time it has finished coming or going (what is under it moved).
export function useKeyboardTop() {
  const [height, setHeight] = useState(0);
  const [settled, setSettled] = useState(0);
  useEffect(() => {
    const listeners = [
      Keyboard.addListener("keyboardWillChangeFrame", (event) =>
        setHeight(Math.max(0, event.endCoordinates.height)),
      ),
      Keyboard.addListener("keyboardWillHide", () => setHeight(0)),
      Keyboard.addListener("keyboardDidShow", () => setSettled((n) => n + 1)),
      Keyboard.addListener("keyboardDidHide", () => setSettled((n) => n + 1)),
    ];
    return () => {
      for (const listener of listeners) listener.remove();
    };
  }, []);
  return { height, settled };
}

/// A tablet popover (2.1): on its anchor, placed by `placePopover`, as tall as its content
/// up to the room there; no dimming. It follows its anchor when the window changes, and
/// closes if the anchor is gone.
export function PopoverFrame({
  anchor,
  width,
  title,
  shown,
  onRequestClose,
  children,
}: {
  anchor: Anchor;
  width: number;
  title?: string;
  shown: SharedValue<number>;
  onRequestClose: () => void;
  children: ReactNode;
}) {
  const window = useWindowSize();
  const { height: keyboard, settled } = useKeyboardTop();
  const [rect, setRect] = useState<Rect | null>("measure" in anchor ? null : anchor);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    let live = true;
    void anchorRect(anchor).then((measured) => {
      if (!live) return;
      if (measured) setRect(measured);
      else onRequestClose();
    });
    return () => {
      live = false;
    };
    // Measured again whenever the window changes (a rotation, a resize) or the keyboard
    // comes or goes (a dialog under it moves).
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, window.width, window.height, settled]);
  const placed: Placement | null = rect
    ? placePopover({ anchor: rect, size: { width, height: height || 1 }, window, keyboard })
    : null;
  const below = placed?.side !== "above";
  const grow = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ scale: 0.94 + 0.06 * shown.value }],
  }));
  return (
    <View className="flex-1">
      <Outside dim={false} onPress={onRequestClose} shown={shown} />
      {/* Drawn, unseen, while its anchor is measured, so its height is known when placed. */}
      <Animated.View
        testID="sheet-popover"
        accessibilityViewIsModal
        onAccessibilityEscape={onRequestClose}
        accessibilityLabel={title}
        onLayout={(event) => setHeight(Math.round(event.nativeEvent.layout.height))}
        style={[
          grow,
          CORNER,
          DEPTH.floating,
          {
            position: "absolute",
            left: placed?.left ?? 0,
            top: placed?.top ?? 0,
            width,
            maxHeight: placed?.maxHeight ?? window.height,
            borderRadius: SURFACE_RADIUS,
            transformOrigin: below ? "top left" : "bottom left",
            // Unseen until it is placed for its height.
            opacity: placed && height ? undefined : 0,
          },
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

/// A popover's insides: no title row, unless a step is pushed (back and its title); the
/// pinned slot, the content scrolling, and the footer.
export function PopoverPanel({
  title,
  stepped,
  onBack,
  pin,
  footer,
  onScroll,
  children,
}: PanelParts) {
  const theme = useTheme();
  return (
    <>
      <Surface />
      {stepped ? (
        <View className="flex-row items-center px-1" style={{ minHeight: MIN_TOUCH }}>
          <IconButton
            label="Back"
            icon={<IconChevronLeft size={20} color={theme.colors.foreground} />}
            onPress={onBack}
          />
          <Text variant="heading" accessibilityRole="header" numberOfLines={1} className="flex-1">
            {title ?? ""}
          </Text>
        </View>
      ) : (
        <View style={{ height: CARD_INSET }} />
      )}
      <Body pin={pin} footer={stepped ? null : footer} onScroll={onScroll}>
        {children}
      </Body>
    </>
  );
}
