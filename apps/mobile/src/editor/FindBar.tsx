import { IconChevronDown, IconChevronUp, IconX } from "@tabler/icons-react-native";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { create } from "zustand";
import { Badge } from "../ui/Badge.tsx";
import { IconButton } from "../ui/Button.tsx";
import { FixedTop } from "../ui/fixed-top.tsx";
import { Card } from "../ui/kit/Card.tsx";
import { SearchField } from "../ui/kit/SearchField.tsx";
import { pushLayer } from "../ui/sheet/layers.ts";
import { useTheme } from "../ui/theme.ts";
import { RADIUS, SPACE } from "../ui/tokens.ts";
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
  const label = theme.colors.foreground;
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
      <Card
        testID="find-bar"
        radius={RADIUS.control + SPACE.sm}
        style={{ flexDirection: "row", alignItems: "center", gap: SPACE.xs, padding: SPACE.sm }}
      >
        <View style={{ flex: 1 }}>
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
          <Badge
            label={result.count === 0 ? "No matches" : `${result.index} of ${result.count}`}
            size="lg"
          />
        ) : null}
        <IconButton
          label="Previous Match"
          variant="secondary"
          size="iconSm"
          icon={<IconChevronUp size={18} color={label} />}
          onPress={() => onStep(-1)}
        />
        <IconButton
          label="Next Match"
          variant="secondary"
          size="iconSm"
          icon={<IconChevronDown size={18} color={label} />}
          onPress={() => onStep(1)}
        />
        <IconButton
          label="Close Find"
          variant="secondary"
          size="iconSm"
          icon={<IconX size={18} color={label} />}
          onPress={close}
        />
      </Card>
    </FixedTop>
  );
}
