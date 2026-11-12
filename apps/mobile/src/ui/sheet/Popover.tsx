import {
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { SheetCloser } from "./Sheet.tsx";

/// How many choices a compact menu holds; more open in the sheet, with a search.
export const COMPACT_CHOICES = 8;

/// Room kept between the menu and the screen's edges and its trigger.
const EDGE = 16;
const GAP = 6;
const MIN_WIDTH = 220;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/// The desktop's dropdown for a few choices (a status, a priority, a size): a small menu at
/// its trigger, under it or above when there is no room, closed by a pick or a tap beside
/// it. The sheet's sibling for short lists; anything long or rich stays in the sheet.
export function Popover({
  open,
  onOpenChange,
  anchor,
  label,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /// What it opens from, to sit beside.
  anchor: RefObject<View | null>;
  /// Read out for the menu: "Status choices".
  label: string;
  children: ReactNode;
}) {
  const screen = useWindowDimensions();
  const insets = useContext(SafeAreaInsetsContext) ?? { top: 0, bottom: 0 };
  const [box, setBox] = useState<Box | null>(null);
  const [height, setHeight] = useState(0);
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  /// How much of the screen the keyboard takes while its search is typed in.
  const [keyboard, setKeyboard] = useState(0);
  useEffect(() => {
    if (!open) return;
    const shown = Keyboard.addListener("keyboardWillShow", (e) =>
      setKeyboard(e.endCoordinates.height),
    );
    const hidden = Keyboard.addListener("keyboardWillHide", () => setKeyboard(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setBox(null);
      setHeight(0);
      return;
    }
    const fallback = { x: EDGE, y: screen.height / 3, width: 0, height: 0 };
    const node = anchor.current;
    if (!node) {
      setBox(fallback);
      return;
    }
    node.measureInWindow((x, y, width, h) =>
      setBox(Number.isFinite(y) ? { x, y, width, height: h } : fallback),
    );
  }, [open, anchor, screen.height]);

  if (!open) return null;
  const ready = box !== null && height > 0;
  const width = Math.min(Math.max(box?.width ?? 0, MIN_WIDTH), screen.width - EDGE * 2);
  const left = Math.min(Math.max(box?.x ?? EDGE, EDGE), screen.width - EDGE - width);
  // Under its trigger, else above it, and always clear of the keyboard.
  const floor = screen.height - Math.max(insets.bottom, keyboard) - EDGE;
  const ceiling = insets.top + EDGE;
  const maxHeight = Math.min(screen.height * 0.6, floor - ceiling);
  const shownHeight = Math.min(height, maxHeight);
  const below = (box?.y ?? 0) + (box?.height ?? 0) + GAP;
  const above = (box?.y ?? 0) - GAP - shownHeight;
  const top =
    below + shownHeight <= floor
      ? below
      : above >= ceiling
        ? above
        : Math.max(ceiling, floor - shownHeight);

  return (
    <Modal transparent visible animationType="none" onRequestClose={close}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close Menu"
        onPress={close}
        style={StyleSheet.absoluteFill}
      />
      {/* Placed once it and its trigger are measured, so it never shows in the wrong place;
          then it fades in. */}
      <View
        accessibilityViewIsModal
        accessibilityLabel={label}
        onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
        style={{
          position: "absolute",
          top,
          left,
          width,
          opacity: ready ? 1 : 0,
        }}
      >
        <Animated.View
          key={ready ? "shown" : "measuring"}
          entering={ready ? FadeIn.duration(120) : undefined}
          style={{ maxHeight }}
          className="rounded-lg border border-border bg-popover p-1 shadow-lg"
        >
          <SheetCloser close={close}>
            <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
              <View className="px-2">{children}</View>
            </ScrollView>
          </SheetCloser>
        </Animated.View>
      </View>
    </Modal>
  );
}
