import { IconChevronLeft } from "@tabler/icons-react-native";
import { RevealProvider } from "../reveal.ts";
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
import { FADE, SPRING, dragFrom, settleDetent, settleSheet } from "../motion.ts";
import { useReduceMotion } from "../reduce-motion.ts";
import { MIN_TOUCH } from "../touch.ts";
import { haptic } from "../haptics.ts";
import { useSemantic } from "../kit/scheme.ts";
import { InCard, InSheet } from "./in-sheet.ts";
import { WindowFrame } from "../../dev/WindowFrame.tsx";
import { CORNER, DEPTH, RADIUS, SPACE } from "../tokens.ts";
import type { Anchor } from "./anchor.ts";
import { recentTouch } from "./touch-point.ts";
import { LayerContext, pushLayer } from "./layers.ts";
import { type CloseGuard, CloseGuardContext } from "./close-guard.ts";
import { CardPanel, DialogFrame, PopoverFrame, PopoverPanel } from "./Floating.tsx";
import { type PinStore, PinnedSlot, makePinStore } from "./pins.tsx";
import {
  DIALOG_WIDTH,
  POPOVER_WIDTH,
  type PresentationKind,
  type SheetPresentation,
  usePresentation,
} from "./presentation.ts";

export { RoundButton } from "./Floating.tsx";
export type { PresentationKind, SheetPresentation } from "./presentation.ts";

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

/// How it shows (`presentation.ts`): on a phone `sheet` comes up from the bottom (forms,
/// menus, display options) and `card` floats in the middle of the screen, as Linear's
/// pickers do (D65), a card opened from inside a sheet floating over it; on a tablet a
/// popover on its anchor or a centred dialog (D83).

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
  /// The person asks it to go (a Close button): what it holds may ask first
  /// (`useCloseGuard`).
  dismiss(): void;
  /// Shows a step on top of the current one, with a back button.
  push(page: SheetPage): void;
  /// Back to the step before.
  back(): void;
  /// How many steps are open (1 at the start).
  depth: number;
  /// How it shows, so a picker opened inside knows whether to float over it.
  presentation: SheetPresentation;
}

const SheetContext = createContext<SheetHandle | null>(null);

/// What a sheet's content uses to close it or push a step. Outside a sheet, null.
export const useSheet = () => useContext(SheetContext);

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

/// What a sheet's content puts in place of the title row (a compose form's close, context
/// and send buttons) and under its list, riding on the keyboard (its property pills).
const EdgeContext = createContext<{
  header: PinStore;
  footer: PinStore;
} | null>(null);

function usePinned(store: PinStore | undefined, children: ReactNode) {
  useEffect(() => {
    store?.set(children);
  });
  useEffect(() => () => store?.set(null), [store]);
}

/// Draws `children` in place of the sheet's title row, kept current; outside a sheet, where
/// it stands.
export function SheetHeader({ children }: { children: ReactNode }) {
  const edges = useContext(EdgeContext);
  usePinned(edges?.header, children);
  return edges ? null : <>{children}</>;
}

/// Pins `children` to the bottom of the sheet, above the keyboard, kept current; outside a
/// sheet, where it stands.
export function SheetFooter({ children }: { children: ReactNode }) {
  const edges = useContext(EdgeContext);
  usePinned(edges?.footer, children);
  return edges ? null : <>{children}</>;
}

/// A dialog's buttons (Clear, Done): pinned under its content, which scrolls on its own, so
/// they stay in view however tall the content grows. Side by side, sharing the width.
export function DialogActions({ children }: { children: ReactNode }) {
  return (
    <SheetFooter>
      <View style={{ flexDirection: "row", gap: SPACE.md }}>{children}</View>
    </SheetFooter>
  );
}

export { useInSheet } from "./in-sheet.ts";
export { useSheetSubmit } from "./layers.ts";

/// While `on`, a layer for Escape and Command Return (`layers.ts`).
function useLayer(on: boolean, close: () => void) {
  const [layer, setLayer] = useState<ReturnType<typeof pushLayer> | null>(null);
  const closeNow = useRef(close);
  useEffect(() => {
    closeNow.current = close;
  });
  useEffect(() => {
    if (!on) return;
    const pushed = pushLayer(() => closeNow.current());
    setLayer(pushed);
    return () => {
      pushed.remove();
      setLayer(null);
    };
  }, [on]);
  return layer;
}

/// The sheet itself, without a window of its own: the backdrop, the panel and its steps.
/// `open` going false sends it down; `onClosed` follows once it is out of sight.
function SheetFrame({
  open,
  title,
  size = "content",
  presentation: requested,
  kind,
  anchor,
  touched,
  wide,
  onRequestClose,
  onClosed,
  children,
}: {
  open: boolean;
  title?: string;
  size?: SheetSize;
  presentation?: SheetPresentation;
  kind?: PresentationKind;
  /// What opened it, for a popover on a tablet.
  anchor?: Anchor;
  /// The anchor is only where the last touch was (`recentTouch`).
  touched?: boolean;
  /// A popover for filters and display options, wider than a list's.
  wide?: boolean;
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
  const headerPin = useMemo(makePinStore, []);
  const footerPin = useMemo(makePinStore, []);
  const edges = useMemo(() => ({ header: headerPin, footer: footerPin }), [headerPin, footerPin]);
  const header = useSyncExternalStore(headerPin.subscribe, headerPin.get);
  const footer = useSyncExternalStore(footerPin.subscribe, footerPin.get);
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
  // What the content asks before it goes at the person's request, and whether it is asking.
  const guard = useRef<CloseGuard | null>(null);
  const asking = useRef(false);
  const setGuard = useCallback((next: CloseGuard | null) => {
    guard.current = next;
  }, []);
  const requestClose = useCallback(() => {
    if (asking.current) {
      // Escape on the question goes back to what was being written.
      pagesNow.current.at(-1)?.onPop?.();
      setPages((now) => now.slice(0, -1));
      return;
    }
    const step = guard.current?.();
    if (!step) return onRequestClose();
    asking.current = true;
    setPages((now) => [
      ...now,
      {
        title: title ? `Discard ${title}?` : "Discard Changes?",
        content: step,
        onPop: () => {
          asking.current = false;
        },
      },
    ]);
  }, [onRequestClose, title]);

  // Opened again, it starts at its first step, even if it was still on its way down.
  useEffect(() => {
    if (open) setPages([]);
  }, [open]);

  const live = usePresentation({
    kind,
    anchored: anchor !== undefined && !touched,
    touched: anchor !== undefined && touched,
    requested,
    large: size === "large",
  });
  // While open it keeps the way it opened: a window turned or narrowed past 600 would draw
  // the content in another frame, remounting it and losing what was typed (12.2). A dialog
  // in a narrow window shrinks to fit it.
  const [kept, setKept] = useState<typeof live | null>(open ? live : null);
  if (open && kept === null) setKept(live);
  if (!open && kept !== null) setKept(null);
  const resolved = kept ?? live;
  const presentation = resolved.presentation;
  const layer = useLayer(
    open && (presentation === "popover" || presentation === "dialog"),
    requestClose,
  );
  /// A card's, dialog's or popover's way in: 0 gone, 1 shown.
  const shown = useSharedValue(0);
  const card = presentation !== "sheet";

  useEffect(() => {
    const to = open ? 0 : window.height;
    target.value = to;
    // A card grows in from its middle and fades, as a menu does, or only fades.
    shown.value = still
      ? withTiming(open ? 1 : 0, { duration: open ? FADE.in : FADE.out })
      : withSpring(open ? 1 : 0, SPRING.menu);
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
      // A frame later, once the sheet's window has gone too: a screen the action opens
      // over everything (the photo library) would otherwise go down with it.
      if (then) requestAnimationFrame(() => requestAnimationFrame(then));
    }, settleTime(still));
    return () => clearTimeout(timer);
  }, [open, offset, target, release, still, window.height, shown]);

  const handle = useMemo<SheetHandle>(
    () => ({
      close: (then) => {
        after.current = then ?? null;
        onRequestClose();
      },
      dismiss: requestClose,
      push: (page) => setPages((now) => [...now, page]),
      back: () => {
        pagesNow.current.at(-1)?.onPop?.();
        setPages((now) => now.slice(0, -1));
      },
      depth: pages.length + 1,
      presentation,
    }),
    [onRequestClose, requestClose, pages.length, presentation],
  );

  const scroll = Gesture.Native();
  const height = window.height;
  const tallest = window.height - insets.top - 16;
  // Plain values only: the style runs on the UI thread, which can't take a step's content.
  const large = (top?.size ?? size) === "large";
  /// How far down a tall sheet's medium stop is: a little over half of it shows.
  const medium = Math.round(tallest * 0.45);
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
      if (large) {
        // A tall sheet rests fully up or at its medium stop, as iOS's detents.
        const stop = settleDetent({ offset: offset.value, velocity, medium });
        if (stop.to === "closed") {
          release.value = stop.velocity;
          runOnJS(onRequestClose)();
          return;
        }
        const to = stop.to === "medium" ? medium : 0;
        if (to !== target.value) runOnJS(haptic)("detent");
        target.value = to;
        offset.value = withSpring(to, { ...SPRING.sheet, velocity: stop.velocity });
        return;
      }
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

  const cardStyle = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ scale: 0.94 + 0.06 * shown.value }],
  }));
  const cardBackdrop = useAnimatedStyle(() => ({ opacity: shown.value }));
  const cardRoom = useAnimatedStyle(() => ({
    paddingBottom: Math.max(bottomInset, keyboard.height.value) + 12,
  }));

  const shownTitle = top ? top.title : title;
  if (card) {
    const parts = {
      title: shownTitle,
      stepped: pages.length > 0,
      onBack: handle.back,
      onClose: requestClose,
      pin,
      footer,
      onScroll,
      children: top ? top.content : children,
    };
    const floating =
      presentation === "popover" && anchor ? (
        <PopoverFrame
          anchor={anchor}
          width={wide || size === "large" ? POPOVER_WIDTH.wide : POPOVER_WIDTH.list}
          title={shownTitle}
          shown={shown}
          onRequestClose={requestClose}
        >
          <PopoverPanel {...parts} />
        </PopoverFrame>
      ) : presentation === "dialog" ? (
        <DialogFrame
          width={DIALOG_WIDTH[resolved.dialog]}
          title={shownTitle}
          shown={shown}
          onRequestClose={requestClose}
        >
          <CardPanel {...parts} header={header} />
        </DialogFrame>
      ) : (
        <Animated.View
          style={[cardRoom, { paddingTop: insets.top + 12 }]}
          className="flex-1 justify-center px-3"
        >
          <Animated.View style={cardBackdrop} className="absolute inset-0 bg-black/60">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onRequestClose}
              className="flex-1"
            />
          </Animated.View>
          <Animated.View
            accessibilityViewIsModal
            style={[
              cardStyle,
              CORNER,
              DEPTH.floating,
              { maxHeight: "100%", borderRadius: RADIUS.card },
            ]}
          >
            <CardPanel {...parts} />
          </Animated.View>
        </Animated.View>
      );
    return (
      <SheetContext.Provider value={handle}>
        <PinContext.Provider value={pin}>
          <EdgeContext.Provider value={edges}>
            <ScrollContext.Provider value={scrollY}>
              <InSheet.Provider value>
                <InCard.Provider value>
                  <LayerContext.Provider value={layer}>
                    <CloseGuardContext.Provider value={setGuard}>
                      {floating}
                    </CloseGuardContext.Provider>
                  </LayerContext.Provider>
                </InCard.Provider>
              </InSheet.Provider>
            </ScrollContext.Provider>
          </EdgeContext.Provider>
        </PinContext.Provider>
      </SheetContext.Provider>
    );
  }
  return (
    <SheetContext.Provider value={handle}>
      <PinContext.Provider value={pin}>
        <EdgeContext.Provider value={edges}>
          <ScrollContext.Provider value={scrollY}>
            <InSheet.Provider value>
              <InCard.Provider value={false}>
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
                      testID="sheet-panel"
                      accessibilityViewIsModal
                      style={[
                        panel,
                        CORNER,
                        DEPTH.floating,
                        {
                          borderTopLeftRadius: RADIUS.sheet,
                          borderTopRightRadius: RADIUS.sheet,
                        },
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
                        <View
                          className="h-1 w-9 rounded-full"
                          style={{ backgroundColor: grabber }}
                        />
                      </View>
                      {header && pages.length === 0 ? (
                        header
                      ) : shownTitle !== undefined || pages.length > 0 ? (
                        <View
                          className="flex-row items-center px-2"
                          style={{ minHeight: MIN_TOUCH }}
                        >
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
                      {footer && pages.length === 0 ? footer : null}
                    </Animated.View>
                  </GestureDetector>
                </View>
              </InCard.Provider>
            </InSheet.Provider>
          </ScrollContext.Provider>
        </EdgeContext.Provider>
      </PinContext.Provider>
    </SheetContext.Provider>
  );
}

/// A value that changes on every render of its owner, read by a step shown elsewhere
/// (in the sheet's own tree), which then follows it without its owner rendering again.
function useLive(value: ReactNode) {
  const store = useMemo(makePinStore, []);
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
      dismiss: parent.back,
      push: parent.push,
      back: parent.back,
      depth: parent.depth,
      presentation: parent.presentation,
    }),
    [parent],
  );
  return <SheetContext.Provider value={handle}>{content}</SheetContext.Provider>;
}

/// Where the finger just went down when `open` turned on, if nothing names what opened
/// it; kept until it opens again, so it closes where it opened.
function useTouchOnOpen(open: boolean, anchor: Anchor | undefined) {
  const [touch, setTouch] = useState(() => (open && !anchor ? recentTouch() : undefined));
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setTouch(anchor ? undefined : recentTouch());
  }
  return touch;
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
  presentation,
  kind,
  anchor,
  wide,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  size?: SheetSize;
  presentation?: SheetPresentation;
  kind?: PresentationKind;
  /// What opened it: on a tablet a picker or menu is a popover on it (`useAnchor`).
  anchor?: Anchor;
  /// On a tablet, a wider popover (filters, display options).
  wide?: boolean;
  children: ReactNode;
}) {
  // A card floats over the sheet it is opened from, in a window of its own; on a tablet a
  // popover floats over a dialog, and is a step inside another popover.
  const outer = useSheet();
  const touch = useTouchOnOpen(open, anchor);
  const shownAs = usePresentation({
    kind,
    anchored: anchor !== undefined,
    touched: touch !== undefined,
    requested: presentation,
    large: size === "large",
  }).presentation;
  const floats = shownAs === "card" || (shownAs === "popover" && outer?.presentation !== "popover");
  const parent = floats ? null : outer;
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
    <WindowSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      size={size}
      presentation={presentation}
      kind={kind}
      anchor={anchor ?? touch}
      touched={!anchor && touch !== undefined}
      wide={wide}
    >
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
  presentation,
  kind,
  anchor,
  touched,
  wide,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  size?: SheetSize;
  presentation?: SheetPresentation;
  kind?: PresentationKind;
  anchor?: Anchor;
  touched?: boolean;
  wide?: boolean;
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
        <WindowFrame clear>
          <SheetFrame
            open={open}
            title={title}
            size={size}
            presentation={presentation}
            kind={kind}
            anchor={anchor}
            touched={touched}
            wide={wide}
            onRequestClose={requestClose}
            onClosed={() => setMounted(false)}
          >
            {/* Declared in a page, drawn over it: the page behind stays where it is. */}
            <RevealProvider value={null}>{children}</RevealProvider>
          </SheetFrame>
        </WindowFrame>
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
  kind,
  wide,
  onClosed,
  children,
}: {
  title: string;
  size?: SheetSize;
  /// What it is, for a tablet's dialog size: a create form unless said otherwise.
  kind?: PresentationKind;
  /// A tablet's popover at its wider width (a composer).
  wide?: boolean;
  onClosed: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const requestClose = useCallback(() => setOpen(false), []);
  // A picker route (the icon picker) floats where the finger that opened it was.
  const touch = useTouchOnOpen(true, undefined);
  return (
    <SheetFrame
      open={open}
      title={title}
      size={size}
      kind={kind}
      anchor={touch}
      touched={touch !== undefined}
      wide={wide}
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
      dismiss: close,
      close: (then) => {
        close();
        then?.();
      },
      push: () => {},
      back: close,
      depth: 1,
      presentation: "popover",
    }),
    [close],
  );
  return <SheetContext.Provider value={handle}>{children}</SheetContext.Provider>;
}
