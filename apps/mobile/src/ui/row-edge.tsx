import { createContext, type ReactNode, useContext } from "react";
import { View, type ViewStyle } from "react-native";
import { useSemantic } from "./kit/scheme.ts";
import { useInSheet } from "./sheet/in-sheet.ts";
import { SPACE } from "./tokens.ts";

/// The room a page keeps between its content and the screen's edges. A list's rows reach
/// past it to the edges, so a pressed row and its swipe actions span the whole width, while
/// what they show stays in line with the rest of the page. 0 where nothing pads the content
/// (a sheet, a card, a grouped section).
const PageGutter = createContext(0);
/// Set inside a row that already reaches the edges (a swipe row), so what it holds pads
/// itself without reaching out again.
const AtEdge = createContext(false);

export function PageGutterProvider({ value, children }: { value: number; children: ReactNode }) {
  return <PageGutter.Provider value={value}>{children}</PageGutter.Provider>;
}

/// How far a row reaches out to the screen's edges (0 in a sheet).
export function useGutter(): number {
  const gutter = useContext(PageGutter);
  return useInSheet() ? 0 : gutter;
}

/// Marks what it holds as already reaching the edges.
export function AtEdgeProvider({ children }: { children: ReactNode }) {
  return <AtEdge.Provider value>{children}</AtEdge.Provider>;
}

/// The style of a list row: out to the screen's edges, its content padded back in line.
/// `inSwipeRow` for a row its caller puts in a `SwipeRow`, which reaches the edges itself
/// (the context can't tell the caller, which sits above the swipe row).
export function useRowEdge({ inSwipeRow = false }: { inSwipeRow?: boolean } = {}): Pick<
  ViewStyle,
  "marginHorizontal" | "paddingHorizontal"
> {
  const gutter = useGutter();
  const atEdge = useContext(AtEdge) || inSwipeRow;
  return {
    marginHorizontal: atEdge || gutter === 0 ? 0 : -gutter,
    paddingHorizontal: gutter + SPACE.xs,
  };
}

/// The hairline under a list row, only as wide as what the row shows (a plain list's
/// separator), even though the row reaches the edges.
export function RowDivider() {
  const separator = useSemantic("separator");
  const gutter = useGutter();
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        bottom: 0,
        left: gutter + SPACE.xs,
        right: gutter + SPACE.xs,
        height: 0.5,
        backgroundColor: separator,
      }}
    />
  );
}
