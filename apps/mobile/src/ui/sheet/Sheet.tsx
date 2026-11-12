import { IconChevronLeft } from "@tabler/icons-react-native";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { BlurView } from "expo-blur";
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedKeyboard,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  type SharedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { IconButton } from "../Button.tsx";
import { Text } from "../Text.tsx";
import { useTheme } from "../theme.ts";
import { FADE, SPRING, dragFrom, settleSheet } from "../motion.ts";
import { useReduceMotion } from "../reduce-motion.ts";
import { MIN_TOUCH } from "../touch.ts";
import { haptic } from "../haptics.ts";
import { useSemantic } from "../kit/scheme.ts";
import { CORNER, DEPTH, RADIUS } from "../tokens.ts";

/// The app's one bottom sheet: every picker, menu, confirmation and create form on the
/// phone opens in it, in place of the desktop's popovers, menus and dialogs. It comes up
/// from the bottom as tall as its content (up to nearly the full screen, then its content
/// scrolls), carries the desktop popover's look (`bg-popover`, a border, rounded top
/// corners) and goes away with a swipe down, a tap on the dimmed page or the system's back.
/// A step inside it (a day, then a time) is pushed onto the same sheet with a back button,
/// never a second sheet on top.

/// How long it takes to come up or go away: the spring's settling time, or a fade's
/// under Reduce Motion. The sheet is gone for good after it.
const settleTime = (still: boolean) => (still ? FADE.out : SPRING.sheet.duration);

export type SheetSize = "content" | "large";

const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

interface SheetPage {
  title?: string;
  size?: SheetSize;
  content: ReactNode;
  /// Told when the step is taken off (Back, or a pick that goes back).
  onPop?: () => void;
}

interface SheetHandle {
  /// Closes the whole sheet, then runs `then` once it is out of sight (an action that
  /// opens a page or another sheet waits for it).
  close(then?: () => void): void;
  /// Shows a step on top of the current one, with a back button.
  push(page: SheetPage): void;
  /// Back to the step before.
  back(): void;
  /// How many steps are open (1 at the start).
  depth: number;
}

const SheetContext = createContext<SheetHandle | null>(null);

/// What a sheet's content uses to close it or push a step. Outside a sheet, null.
export const useSheet = () => useContext(SheetContext);

/// What a step pins above its list (a search field, the section scrolled to), so it stays
/// put while the list scrolls under it.
interface PinStore {
  get(): ReactNode;
  set(node: ReactNode): void;
  subscribe(listener: () => void): () => void;
}

function makePinStore(): PinStore {
  let current: ReactNode = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (next) => {
      current = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

const PinContext = createContext<PinStore | null>(null);
const ScrollContext = createContext<SharedValue<number> | null>(null);

/// How far the sheet's list has scrolled, for a header that follows it. Outside a sheet,
/// null.
export const useSheetScroll = () => useContext(ScrollContext);

/// Pins `children` above the sheet's list, under its title; outside a sheet it is drawn
/// where it stands.
export function SheetPinned({ children }: { children: ReactNode }) {
  const pin = useContext(PinContext);
  useEffect(() => {
    pin?.set(children);
  });
  useEffect(() => () => pin?.set(null), [pin]);
  return pin ? null : <>{children}</>;
}

function PinnedSlot({ store }: { store: PinStore }) {
  const node = useSyncExternalStore(store.subscribe, store.get);
  return node ? <View className="px-4 pb-2">{node}</View> : null;
}

/// Lets a page laid out for a screen (`Screen`) know it sits in a sheet, which scrolls
/// for it.
const InSheet = createContext(false);
export const useInSheet = () => useContext(InSheet);

/// The sheet itself, without a window of its own: the backdrop, the panel and its steps.
/// `open` going false sends it down; `onClosed` follows once it is out of sight.
function SheetFrame({
  open,
  title,
  size = "content",
  onRequestClose,
  onClosed,
  children,
}: {
  open: boolean;
  title?: string;
  size?: SheetSize;
  /// The person asked it to go: a swipe, the backdrop, the system's back.
  onRequestClose: () => void;
  onClosed: () => void;
  children: ReactNode;
}) {
  const theme = useTheme();
  // The app's safe area; a sheet opened outside the app's frame (a test) has none.
  const insets = useContext(SafeAreaInsetsContext) ?? NO_INSETS;
  const window = useWindowDimensions();
  const keyboard = useAnimatedKeyboard();
  const offset = useSharedValue(window.height);
  /// Where it is headed (0 open, the window's height away), and how fast the finger let go.
  const target = useSharedValue(0);
  const release = useSharedValue(0);
  /// Where a drag picked it up, wherever an animation had it.
  const start = useSharedValue(0);
  const still = useReduceMotion();
  const scrollY = useSharedValue(0);
  const pin = useMemo(makePinStore, []);
  const grabber = useSemantic("tertiaryLabel");
  const [pages, setPages] = useState<SheetPage[]>([]);
  const pagesNow = useRef(pages);
  useEffect(() => {
    pagesNow.current = pages;
  });
  const top = pages.at(-1);
  const closed = useRef(onClosed);
  useEffect(() => {
    closed.current = onClosed;
  });
  const after = useRef<(() => void) | null>(null);

  // Opened again, it starts at its first step, even if it was still on its way down.
  useEffect(() => {
    if (open) setPages([]);
  }, [open]);

  useEffect(() => {
    const to = open ? 0 : window.height;
    target.value = to;
    // A spring from wherever it is, carrying the finger's speed; under Reduce Motion a
    // short slide that reads as a fade with the backdrop.
    offset.value = still
      ? withTiming(to, { duration: FADE.in })
      : withSpring(to, { ...SPRING.sheet, velocity: release.value });
    release.value = 0;
    if (open) return;
    // A timer, not the animation's callback, so it finishes the same way in tests.
    const timer = setTimeout(() => {
      closed.current();
      const then = after.current;
      after.current = null;
      then?.();
    }, settleTime(still));
    return () => clearTimeout(timer);
  }, [open, offset, target, release, still, window.height]);

  const handle = useMemo<SheetHandle>(
    () => ({
      close: (then) => {
        after.current = then ?? null;
        onRequestClose();
      },
      push: (page) => setPages((now) => [...now, page]),
      back: () => {
        pagesNow.current.at(-1)?.onPop?.();
        setPages((now) => now.slice(0, -1));
      },
      depth: pages.length + 1,
    }),
    [onRequestClose, pages.length],
  );

  const scroll = Gesture.Native();
  const height = window.height;
  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetX([-16, 16])
    .simultaneousWithExternalGesture(scroll)
    .onBegin(() => {
      // A finger on a moving sheet stops it where it is.
      cancelAnimation(offset);
      start.value = offset.value;
    })
    .onUpdate((event) => {
      // Only a list scrolled to its top lets the sheet follow the finger down.
      if (scrollY.value <= 0) offset.value = dragFrom(start.value, height)(event.translationY);
    })
    .onEnd((event) => {
      const velocity = scrollY.value <= 0 ? event.velocityY : 0;
      const settled = settleSheet({ offset: offset.value, velocity });
      if (settled.to === "closed") {
        release.value = settled.velocity;
        runOnJS(onRequestClose)();
      } else {
        // It falls back onto its stop, felt as a soft thud.
        runOnJS(haptic)("detent");
        offset.value = withSpring(0, { ...SPRING.sheet, velocity: settled.velocity });
      }
    })
    .onFinalize((_event, success) => {
      // A touch that never became a drag (a tap on a row) lets it carry on where it was going.
      if (!success) offset.value = withSpring(target.value, SPRING.sheet);
    });
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  const tallest = window.height - insets.top - 16;
  // Plain values only: the style runs on the UI thread, which can't take a step's content.
  const large = (top?.size ?? size) === "large";
  const bottomInset = insets.bottom;
  const panel = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
    paddingBottom: Math.max(bottomInset, keyboard.height.value),
    maxHeight: tallest,
    height: large ? tallest : undefined,
  }));
  const backdrop = useAnimatedStyle(() => ({
    opacity: 1 - offset.value / window.height,
  }));

  const shownTitle = top ? top.title : title;
  return (
    <SheetContext.Provider value={handle}>
      <PinContext.Provider value={pin}>
        <ScrollContext.Provider value={scrollY}>
          <InSheet.Provider value>
            <View className="flex-1 justify-end">
              <Animated.View style={backdrop} className="absolute inset-0 bg-black/50">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  onPress={onRequestClose}
                  className="flex-1"
                />
              </Animated.View>
              <GestureDetector gesture={pan}>
                <Animated.View
                  accessibilityViewIsModal
                  style={[
                    panel,
                    CORNER,
                    DEPTH.floating,
                    { borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet },
                  ]}
                >
                  {/* iOS's sheet material: the page shows through, blurred. */}
                  <BlurView
                    tint="systemThickMaterial"
                    intensity={100}
                    style={[
                      StyleSheet.absoluteFill,
                      CORNER,
                      {
                        borderTopLeftRadius: RADIUS.sheet,
                        borderTopRightRadius: RADIUS.sheet,
                        overflow: "hidden",
                      },
                    ]}
                  />
                  <View className="items-center pt-2" accessibilityElementsHidden>
                    <View className="h-1 w-9 rounded-full" style={{ backgroundColor: grabber }} />
                  </View>
                  {shownTitle !== undefined || pages.length > 0 ? (
                    <View className="flex-row items-center px-2" style={{ minHeight: MIN_TOUCH }}>
                      <View style={{ width: MIN_TOUCH }}>
                        {pages.length > 0 ? (
                          <IconButton
                            label="Back"
                            icon={<IconChevronLeft size={20} color={theme.colors.foreground} />}
                            onPress={handle.back}
                          />
                        ) : null}
                      </View>
                      <Text
                        variant="heading"
                        accessibilityRole="header"
                        numberOfLines={1}
                        className="flex-1 text-center"
                      >
                        {shownTitle ?? ""}
                      </Text>
                      <View style={{ width: MIN_TOUCH }} />
                    </View>
                  ) : null}
                  <PinnedSlot store={pin} />
                  <GestureDetector gesture={scroll}>
                    <Animated.ScrollView
                      bounces={false}
                      keyboardShouldPersistTaps="handled"
                      scrollEventThrottle={16}
                      onScroll={onScroll}
                      contentContainerClassName="gap-4 px-4 pb-4 pt-1"
                    >
                      {top ? top.content : children}
                    </Animated.ScrollView>
                  </GestureDetector>
                </Animated.View>
              </GestureDetector>
            </View>
          </InSheet.Provider>
        </ScrollContext.Provider>
      </PinContext.Provider>
    </SheetContext.Provider>
  );
}

/// A value that changes on every render of its owner, read by a step shown elsewhere
/// (in the sheet's own tree), which then follows it without its owner rendering again.
function useLive(value: ReactNode) {
  const store = useMemo(() => {
    let current: ReactNode = null;
    const listeners = new Set<() => void>();
    return {
      get: () => current,
      set: (next: ReactNode) => {
        current = next;
        for (const listener of listeners) listener();
      },
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => void listeners.delete(listener);
      },
    };
  }, []);
  useEffect(() => store.set(value));
  return store;
}

/// A step a field inside a sheet pushed onto it: its picker, kept current, where closing
/// means going back to the form.
function LiveStep({ store, parent }: { store: ReturnType<typeof useLive>; parent: SheetHandle }) {
  const content = useSyncExternalStore(store.subscribe, store.get);
  const handle = useMemo<SheetHandle>(
    () => ({
      close: (then) => {
        parent.back();
        then?.();
      },
      push: parent.push,
      back: parent.back,
      depth: parent.depth,
    }),
    [parent],
  );
  return <SheetContext.Provider value={handle}>{content}</SheetContext.Provider>;
}

/// A sheet opened from where it is used: `open` shows it, and it asks to close through
/// `onOpenChange(false)`. Its content is rendered in place, so it always shows the
/// current values. Opened from inside a sheet (a field of a create form), it is a step
/// pushed onto that sheet with a back button, never a second sheet.
export function Sheet({
  open,
  onOpenChange,
  title,
  size,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  size?: SheetSize;
  children: ReactNode;
}) {
  const parent = useSheet();
  const live = useLive(children);
  const opened = useRef(false);
  useEffect(() => {
    if (!parent || !open || opened.current) return;
    opened.current = true;
    live.set(children);
    parent.push({
      title,
      size,
      content: <LiveStep store={live} parent={parent} />,
      onPop: () => {
        opened.current = false;
        onOpenChange(false);
      },
    });
    // Pushed once per opening; the step follows `children` through `live`.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [open, parent]);
  if (parent) return null;
  return (
    <WindowSheet open={open} onOpenChange={onOpenChange} title={title} size={size}>
      {children}
    </WindowSheet>
  );
}

/// The sheet in a window of its own (`Modal`), over everything.
function WindowSheet({
  open,
  onOpenChange,
  title,
  size,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  size?: SheetSize;
  children: ReactNode;
}) {
  // Stays up after `open` turns false, until it has gone down.
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);
  const requestClose = useCallback(() => onOpenChange(false), [onOpenChange]);
  if (!mounted) return null;
  return (
    <Modal
      transparent
      visible
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={requestClose}
    >
      <GestureHandlerRootView className="flex-1">
        <SheetFrame
          open={open}
          title={title}
          size={size}
          onRequestClose={requestClose}
          onClosed={() => setMounted(false)}
        >
          {children}
        </SheetFrame>
      </GestureHandlerRootView>
    </Modal>
  );
}

/// A route that is a sheet (a create form): the route's screen is see through
/// (`presentation: "transparentModal"`), and this draws the sheet on it. Going away pops
/// the route.
export function RouteSheet({
  title,
  size,
  onClosed,
  children,
}: {
  title: string;
  size?: SheetSize;
  onClosed: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const requestClose = useCallback(() => setOpen(false), []);
  return (
    <SheetFrame
      open={open}
      title={title}
      size={size}
      onRequestClose={requestClose}
      onClosed={onClosed}
    >
      {children}
    </SheetFrame>
  );
}

/// Gives content laid out for a sheet (`OptionList`, `MenuList`) its way to close when it
/// sits somewhere else: the compact menu (`Popover`). It has no steps.
export function SheetCloser({ close, children }: { close: () => void; children: ReactNode }) {
  const handle = useMemo<SheetHandle>(
    () => ({
      close: (then) => {
        close();
        then?.();
      },
      push: () => {},
      back: close,
      depth: 1,
    }),
    [close],
  );
  return <SheetContext.Provider value={handle}>{children}</SheetContext.Provider>;
}
