import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { haptic } from "../haptics.ts";
import { CORNER, RADIUS, TINT, TINT_FILL, withAlpha } from "../tokens.ts";
import { useScheme, useSemantic } from "./scheme.ts";

export interface GridCell {
  key: string;
  label: string;
  selected: boolean;
  onPress: () => void;
  content: ReactNode;
}

/// Icons or emoji in even square cells, as iOS lays out a symbol picker: the chosen one on
/// a tinted square, a cell darkening under a finger.
export function IconGrid({ cells, columns = 7 }: { cells: GridCell[]; columns?: number }) {
  const scheme = useScheme();
  const pressed = useSemantic("pressed");
  const chosen = withAlpha(TINT.blue[scheme], TINT_FILL[scheme] + 0.08);
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
      {cells.map((cell) => (
        <View key={cell.key} style={{ width: `${100 / columns}%`, aspectRatio: 1, padding: 2 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={cell.label}
            accessibilityState={{ selected: cell.selected }}
            unstable_pressDelay={0}
            onPress={() => {
              haptic("select");
              cell.onPress();
            }}
            style={({ pressed: down }) => [
              CORNER,
              {
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: RADIUS.control,
                backgroundColor: down ? pressed : cell.selected ? chosen : undefined,
              },
            ]}
          >
            {cell.content}
          </Pressable>
        </View>
      ))}
    </View>
  );
}
