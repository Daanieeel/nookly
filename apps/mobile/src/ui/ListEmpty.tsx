import { IconFilter } from "@tabler/icons-react-native";
import type { GlyphIcon } from "./kit/Glyph.tsx";
import { EmptyState } from "./kit/States.tsx";

/// What a filtered list shows when it shows nothing: with nothing there at all, its icon and
/// what to do first; with filters hiding everything, that, and a Clear Filters button under
/// it, as the desktop's lists offer.
export function ListEmpty({
  glyph,
  total,
  shown,
  nothingYet,
  onClear,
}: {
  /// The desktop's icon for what the list holds.
  glyph: GlyphIcon;
  /// How many there are before filtering, and how many the filters leave.
  total: number;
  shown: number;
  nothingYet: { title: string; message?: string };
  onClear: () => void;
}) {
  if (total === 0) return <EmptyState glyph={glyph} {...nothingYet} />;
  if (shown > 0) return null;
  return (
    <EmptyState
      glyph={IconFilter}
      title="No Matches"
      message="Nothing matches these filters."
      action={{ label: "Clear Filters", onPress: onClear }}
    />
  );
}
