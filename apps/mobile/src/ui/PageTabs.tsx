import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { SPRING } from "./motion.ts";
import { useReduceMotion } from "./reduce-motion.ts";
import { cn } from "./classes.ts";
import { Text } from "./Text.tsx";
import { MIN_TOUCH } from "./touch.ts";
import { haptic } from "./haptics.ts";

export interface PageTab<Id extends string> {
  id: Id;
  label: string;
  /// How many the tab holds, shown muted after its label.
  count?: number;
}

/// Tabs inside a page, the desktop's `PageTabs`: a quiet row of labels over a hairline, the
/// open one in the text colour and underlined in the primary colour. Never a row of filled
/// buttons. As tall as a finger needs; scrolls sideways when the labels do not fit. The
/// underline slides to the tab picked on a spring.
export function PageTabs<Id extends string>({
  label,
  tabs,
  value,
  onChange,
}: {
  label: string;
  tabs: PageTab<Id>[];
  value: Id;
  onChange: (id: Id) => void;
}) {
  const [spans, setSpans] = useState<Record<string, { x: number; width: number }>>({});
  const still = useReduceMotion();
  const x = useSharedValue(0);
  const width = useSharedValue(0);
  const span = spans[value];
  useEffect(() => {
    if (!span) return;
    // The first place is taken at once; from then on it slides.
    const first = width.value === 0;
    x.value = still || first ? span.x : withSpring(span.x, SPRING.press);
    width.value = still || first ? span.width : withSpring(span.width, SPRING.press);
  }, [span, still, x, width]);
  const underline = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
    width: width.value,
  }));
  return (
    <View className="border-b border-border">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="tablist"
        accessibilityLabel={label}
        contentContainerClassName="gap-1"
      >
        {tabs.map((tab) => {
          const selected = tab.id === value;
          const name = tab.count === undefined ? tab.label : `${tab.label} ${tab.count}`;
          return (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityLabel={name}
              accessibilityState={{ selected }}
              onPress={() => {
                if (!selected) haptic("select");
                onChange(tab.id);
              }}
              onLayout={(event) => {
                const { x: left, width: w } = event.nativeEvent.layout;
                setSpans((now) =>
                  now[tab.id]?.x === left && now[tab.id]?.width === w
                    ? now
                    : { ...now, [tab.id]: { x: left, width: w } },
                );
              }}
              style={{ height: MIN_TOUCH }}
              className="flex-row items-center gap-1.5 px-2.5"
            >
              <Text
                className={cn(
                  "text-sm font-medium",
                  selected ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {tab.label}
              </Text>
              {tab.count === undefined ? null : (
                <Text className="text-sm text-muted-foreground tabular-nums">{tab.count}</Text>
              )}
            </Pressable>
          );
        })}
        {/* The underline, on the bottom edge over the bar's hairline. */}
        <Animated.View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="absolute bottom-0 left-0 h-0.5 bg-primary"
          style={underline}
        />
      </ScrollView>
    </View>
  );
}

/// The tab to open with: the first that holds something, or the first when none does.
export function firstFilled<Id extends string>(tabs: { id: Id; count: number }[]): Id {
  return (tabs.find((t) => t.count > 0) ?? tabs[0]).id;
}
