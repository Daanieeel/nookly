import { IconLayoutColumns } from "@tabler/icons-react-native";
import { View } from "react-native";
import { cn } from "../ui/classes.ts";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { SPLIT_EDGE, useTabDrag } from "./tab-drag.ts";

/// While a tab is dragged, the window's right edge where dropping it opens it in a group of
/// its own, as the desktop's split drop zone: a faint strip, filled while the tab is over it.
export function SplitDropZone({ top }: { top: number }) {
  const theme = useTheme();
  const { dragging, overEdge } = useTabDrag();
  if (!dragging) return null;
  return (
    <View
      testID="split-drop-zone"
      pointerEvents="none"
      className={cn(
        "absolute right-2 bottom-2 items-center justify-center gap-2 rounded-lg border-2 border-dashed",
        overEdge ? "border-primary bg-primary/15" : "border-border bg-muted/40",
      )}
      style={{ top, width: overEdge ? SPLIT_EDGE * 3 : SPLIT_EDGE - 8 }}
    >
      <IconLayoutColumns
        size={22}
        color={overEdge ? theme.colors.primary : theme.colors.mutedForeground}
      />
      {overEdge ? <Text variant="label">Open on the Right</Text> : null}
    </View>
  );
}
