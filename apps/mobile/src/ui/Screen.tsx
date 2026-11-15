import {
  type RefObject,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Keyboard,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { PAGE_BACKGROUND, cn } from "./classes.ts";
import { useInSheet } from "./sheet/Sheet.tsx";
import { useSemantic } from "./kit/scheme.ts";
import { FloatingLayer, useSlotStore } from "./floating.tsx";
import { FixedTopContext } from "./fixed-top.tsx";
import { PageGutterProvider } from "./row-edge.tsx";
import { GUTTER } from "./tokens.ts";

/// Lets what sits in a screen's scrolling page ask for a point of its own to be in
/// view: the editor, for the line being typed in.
const RevealContext = createContext<((anchor: View, y: number) => void) | null>(null);

export const useReveal = () => useContext(RevealContext);
export const RevealProvider = RevealContext.Provider;

/// Keeps `anchor` in view, `height()` of it, while someone types in it: the keyboard rises
/// over the bottom of the page, so once it is up the page scrolls just enough to keep the
/// field above it. Nothing happens where no page scrolls (a sheet).
export function useRevealWhileTyping(
  anchor: RefObject<View | null>,
  typing: boolean,
  height: () => number,
) {
  const reveal = useReveal();
  const measure = useRef(height);
  measure.current = height;
  useEffect(() => {
    if (!typing || !reveal) return;
    const show = () => {
      if (anchor.current) reveal(anchor.current, measure.current());
    };
    show();
    const sub = Keyboard.addListener("keyboardDidShow", show);
    return () => sub.remove();
  }, [typing, reveal, anchor]);
}

/// A screen's scrolling page on the app's background, with pull to sync. In a sheet (a
/// create form) the sheet scrolls, so the page is only its column.
export function Screen(props: {
  wide?: boolean;
  /// A page of grouped sections (Settings): iOS's grouped background behind them.
  grouped?: boolean;
  children: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const inSheet = useInSheet();
  if (inSheet) return <View className="gap-5">{props.children}</View>;
  return <ScrollingScreen {...props} />;
}

function ScrollingScreen({
  children,
  grouped = false,
  onRefresh,
  refreshing = false,
  wide = false,
}: {
  /// Fills a wide pane instead of staying a comfortable reading width (the week view).
  wide?: boolean;
  grouped?: boolean;
  children: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const groupedBackground = useSemantic("groupedBackground");
  const scroll = useRef<ScrollView>(null);
  const content = useRef<View>(null);
  const offset = useRef(0);
  const height = useRef(0);
  const top = useSlotStore();
  // Whether the page has scrolled under its fixed top: a hairline then parts them.
  const [under, setUnder] = useState(false);
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = event.nativeEvent.contentOffset.y;
    setUnder(offset.current > 0);
  }, []);
  const separator = useSemantic("separator");
  const column = cn(!wide && "w-full max-w-3xl self-center");
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    height.current = event.nativeEvent.layout.height;
  }, []);
  /// `y` is measured from the top of `anchor`; the page scrolls just enough to show it.
  const reveal = useMemo(
    () => (anchor: View, y: number) => {
      const node = content.current;
      if (!node) return;
      anchor.measureLayout(
        node,
        (_x, top) => {
          const at = top + y;
          const margin = 32;
          if (at + margin > offset.current + height.current) {
            scroll.current?.scrollTo({ y: at + margin - height.current, animated: true });
          } else if (at < offset.current + margin) {
            scroll.current?.scrollTo({ y: Math.max(0, at - margin), animated: true });
          }
        },
        () => {},
      );
    },
    [],
  );
  const background = grouped ? { backgroundColor: groupedBackground } : undefined;
  const pageBackground = grouped ? undefined : PAGE_BACKGROUND;
  return (
    <RevealContext.Provider value={reveal}>
      <FixedTopContext.Provider value={top.store}>
        <FloatingLayer>
          <View className={cn("flex-1", pageBackground)} style={background}>
            {top.shown.length > 0 ? (
              <View
                style={{
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: under ? separator : "transparent",
                }}
              >
                <View className={cn("gap-3 px-4 pb-3 pt-4", column)}>
                  <PageGutterProvider value={GUTTER}>{top.shown}</PageGutterProvider>
                </View>
              </View>
            ) : null}
            <ScrollView
              ref={scroll}
              className="flex-1"
              contentInsetAdjustmentBehavior="automatic"
              keyboardShouldPersistTaps="handled"
              scrollEventThrottle={32}
              onScroll={onScroll}
              onLayout={onLayout}
              refreshControl={
                onRefresh ? (
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                ) : undefined
              }
            >
              <View
                ref={content}
                collapsable={false}
                className={cn("gap-5 p-4 pb-12", top.shown.length > 0 && "pt-2", column)}
              >
                {/* p-4: list rows reach past it to the screen's edges. */}
                <PageGutterProvider value={GUTTER}>{children}</PageGutterProvider>
              </View>
            </ScrollView>
          </View>
        </FloatingLayer>
      </FixedTopContext.Provider>
    </RevealContext.Provider>
  );
}
