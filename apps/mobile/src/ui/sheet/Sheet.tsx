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
import { Modal, Pressable, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedKeyboard,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { IconButton } from "../Button.tsx";
import { Text } from "../Text.tsx";
import { useTheme } from "../theme.ts";
import { MIN_TOUCH } from "../touch.ts";

/// The app's one bottom sheet: every picker, menu, confirmation and create form on the
/// phone opens in it, in place of the desktop's popovers, menus and dialogs. It comes up
/// from the bottom as tall as its content (up to nearly the full screen, then its content
/// scrolls), carries the desktop popover's look (`bg-popover`, a border, rounded top
/// corners) and goes away with a swipe down, a tap on the dimmed page or the system's back.
/// A step inside it (a day, then a time) is pushed onto the same sheet with a back button,
/// never a second sheet on top.

/// How long it takes to come up or go away.
const DURATION = 220;
/// How far a swipe down must carry it, or how fast, before it goes away.
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 900;

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
  const scrollY = useSharedValue(0);
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
    if (open) {
      offset.value = withTiming(0, { duration: DURATION });
      return;
    }
    offset.value = withTiming(window.height, { duration: DURATION });
    // A timer, not the animation's callback, so it finishes the same way in tests.
    const timer = setTimeout(() => {
      closed.current();
      const then = after.current;
      after.current = null;
      then?.();
    }, DURATION);
    return () => clearTimeout(timer);
  }, [open, offset, window.height]);

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
  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetX([-16, 16])
    .simultaneousWithExternalGesture(scroll)
    .onUpdate((event) => {
      // Only a list scrolled to its top lets the sheet follow the finger down.
      if (scrollY.value <= 0) offset.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (
        offset.value > DISMISS_DISTANCE ||
        (scrollY.value <= 0 && event.velocityY > DISMISS_VELOCITY)
      ) {
        runOnJS(onRequestClose)();
      } else {
        offset.value = withTiming(0, { duration: DURATION });
      }
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
              style={panel}
              className="rounded-t-xl border border-b-0 border-border bg-popover"
            >
              <View className="items-center pt-2" accessibilityElementsHidden>
                <View
                  className="h-1 w-9 rounded-full"
                  style={{ backgroundColor: theme.colors.mutedForeground, opacity: 0.4 }}
                />
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
