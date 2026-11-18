import { useState } from "react";
import { View } from "react-native";

const GAP = 12;

/// How many columns of at least `min` points fit in `width`, at most `max`.
export function columnsFor(width: number, min: number, max = 4): number {
  if (width <= 0) return 1;
  return Math.max(1, Math.min(max, Math.floor((width + GAP) / (min + GAP))));
}

/// A gallery of cards in as many equal columns as fit: one on a phone, more on an iPad,
/// like the desktop's galleries (courses, decks, recipes, files).
export function Grid({
  min = 160,
  max = 4,
  children,
}: {
  /// The narrowest a card may get.
  min?: number;
  max?: number;
  children: React.ReactNode[] | React.ReactNode;
}) {
  const [width, setWidth] = useState(0);
  const columns = columnsFor(width, min, max);
  const each = width > 0 ? (width - GAP * (columns - 1)) / columns : undefined;
  const items = Array.isArray(children) ? children : [children];
  return (
    <View
      className="flex-row flex-wrap"
      style={{ gap: GAP }}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {items.map((child, index) => (
        // The cards come in a fixed order from one list.
        // oxlint-disable-next-line react/no-array-index-key
        <View key={index} style={{ width: each ?? "100%" }}>
          {child}
        </View>
      ))}
    </View>
  );
}
