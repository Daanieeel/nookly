import { Pressable, ScrollView, View } from "react-native";
import { cn } from "./classes.ts";
import { Text } from "./Text.tsx";
import { MIN_TOUCH } from "./touch.ts";

export interface PageTab<Id extends string> {
  id: Id;
  label: string;
  /// How many the tab holds, shown muted after its label.
  count?: number;
}

/// Tabs inside a page, the desktop's `PageTabs`: a quiet row of labels over a hairline, the
/// open one in the text colour and underlined in the primary colour. Never a row of filled
/// buttons. As tall as a finger needs; scrolls sideways when the labels do not fit.
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
              onPress={() => onChange(tab.id)}
              style={{ height: MIN_TOUCH }}
              className={cn(
                // The underline sits on the bar's hairline rather than above it.
                "-mb-px flex-row items-center gap-1.5 border-b-2 px-2.5",
                selected ? "border-primary" : "border-transparent",
              )}
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
      </ScrollView>
    </View>
  );
}

/// The tab to open with: the first that holds something, or the first when none does.
export function firstFilled<Id extends string>(tabs: { id: Id; count: number }[]): Id {
  return (tabs.find((t) => t.count > 0) ?? tabs[0]).id;
}
