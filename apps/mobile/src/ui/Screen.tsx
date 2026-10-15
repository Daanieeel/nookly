import { createContext, useCallback, useContext, useMemo, useRef } from "react";
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import { PAGE_BACKGROUND, cn } from "./classes.ts";

/// Lets what sits in a screen's scrolling page ask for a point of its own to be in
/// view: the editor, for the line being typed in.
const RevealContext = createContext<((anchor: View, y: number) => void) | null>(null);

export const useReveal = () => useContext(RevealContext);

/// A screen's scrolling page on the app's background, with pull to sync.
export function Screen({
  children,
  onRefresh,
  refreshing = false,
  wide = false,
}: {
  /// Fills a wide pane instead of staying a comfortable reading width (the week view).
  wide?: boolean;
  children: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const scroll = useRef<ScrollView>(null);
  const content = useRef<View>(null);
  const offset = useRef(0);
  const height = useRef(0);
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = event.nativeEvent.contentOffset.y;
  }, []);
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
  return (
    <RevealContext.Provider value={reveal}>
      <ScrollView
        ref={scroll}
        className={cn("flex-1", PAGE_BACKGROUND)}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={32}
        onScroll={onScroll}
        onLayout={onLayout}
        refreshControl={
          onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
        }
      >
        <View
          ref={content}
          collapsable={false}
          className={cn("gap-5 p-4 pb-12", !wide && "w-full max-w-3xl self-center")}
        >
          {children}
        </View>
      </ScrollView>
    </RevealContext.Provider>
  );
}
