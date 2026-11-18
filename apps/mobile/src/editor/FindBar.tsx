import { IconChevronDown, IconChevronUp, IconX } from "@tabler/icons-react-native";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { create } from "zustand";
import { IconButton } from "../ui/Button.tsx";
import { FixedTop } from "../ui/fixed-top.tsx";
import { SearchField } from "../ui/kit/SearchField.tsx";
import { pushLayer } from "../ui/sheet/layers.ts";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import type { FindResult } from "./find.ts";

/// Whether the find bar is open over the page shown (`Cmd+F`, the desktop's find in page).
export const useFindBar = create<{ open: boolean }>(() => ({ open: false }));

export type { FindResult } from "./find.ts";

/// The desktop's find bar (`FindBar`) above a tablet's page: a field, which match of how
/// many, Previous and Next, and Close (or Escape), which clears what was found.
export function FindBar({
  result,
  onFind,
  onStep,
}: {
  result: FindResult;
  onFind: (query: string) => void;
  onStep: (step: 1 | -1) => void;
}) {
  const theme = useTheme();
  const muted = theme.colors.mutedForeground;
  const [query, setQuery] = useState("");
  const find = useRef(onFind);
  find.current = onFind;
  const close = () => {
    find.current("");
    useFindBar.setState({ open: false });
  };
  const closeRef = useRef(close);
  closeRef.current = close;
  // Escape closes it, as any popover.
  useEffect(() => {
    const layer = pushLayer(() => closeRef.current());
    return () => layer.remove();
  }, []);
  return (
    <FixedTop>
      <View testID="find-bar" className="flex-row items-center gap-1">
        <View className="flex-1">
          <SearchField
            label="Find in Page"
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              onFind(text);
            }}
            onSubmit={() => onStep(1)}
            autoFocus
          />
        </View>
        {query.trim() ? (
          <Text variant="small" tone="muted" className="px-1">
            {result.count === 0 ? "No matches" : `${result.index} of ${result.count}`}
          </Text>
        ) : null}
        <IconButton
          label="Previous Match"
          icon={<IconChevronUp size={20} color={muted} />}
          onPress={() => onStep(-1)}
        />
        <IconButton
          label="Next Match"
          icon={<IconChevronDown size={20} color={muted} />}
          onPress={() => onStep(1)}
        />
        <IconButton label="Close Find" icon={<IconX size={20} color={muted} />} onPress={close} />
      </View>
    </FixedTop>
  );
}
