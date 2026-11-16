import { PointerPressable } from "./PointerPressable.tsx";
import { IconChevronDown, IconChevronUp, IconSelector } from "@tabler/icons-react-native";
import { type ReactNode, useState } from "react";
import { Pressable, View } from "react-native";
import { cn } from "./classes.ts";
import { FixedTop } from "./fixed-top.tsx";
import { usePageWidth } from "./pane.tsx";
import { ROW_DIVIDER } from "./Row.tsx";
import { useScale } from "./scale.ts";
import { Text } from "./Text.tsx";
import { useTheme } from "./theme.ts";
import { MIN_TOUCH } from "./touch.ts";

/// One column of a table: its heading, how wide it is ("fill" takes the room the others
/// leave), the page width under which it gives way, and how a row shows in it. A column
/// with `sortValue` sorts the rows when its heading is tapped.
export interface Column<T> {
  id: string;
  label: string;
  width: "fill" | number;
  hideBelow?: number;
  align?: "end";
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
}

export interface TableSort {
  id: string;
  desc: boolean;
}

/// Under this page width a row keeps only its fill column, the others on a second line.
export const STACK_BELOW = 420;

const COLLATOR = new Intl.Collator(undefined, { sensitivity: "base" });

/// Numbers by size, text as a person reads it (case aside).
function compare(a: string | number, b: string | number): number {
  if (Number.isFinite(a) && Number.isFinite(b)) return Number(a) - Number(b);
  return COLLATOR.compare(String(a), String(b));
}

/// The rows in `sort`'s order, the rest as given.
export function sortRows<T>(rows: readonly T[], columns: Column<T>[], sort: TableSort | null): T[] {
  const by = columns.find((c) => c.id === sort?.id)?.sortValue;
  if (!by || !sort) return [...rows];
  const sorted = [...rows].sort((a, b) => compare(by(a), by(b)));
  return sort.desc ? sorted.reverse() : sorted;
}

/// The desktop's data table (`data-table.tsx`) for a tablet's lists (3.3): the headings
/// stay above the scrolling list, a tap on one sorts by it (again the other way), rows sit
/// at the touch height with the one shown beside the list marked, and in a narrow page
/// columns give way, then go under the title, so it never scrolls sideways.
export function DataTable<T>({
  label,
  rows,
  columns,
  keyOf,
  titleOf,
  onPress,
  onLongPress,
  selected,
  initialSort = null,
  wrapRow,
  trailing,
  headings = "fixed",
}: {
  label: string;
  rows: readonly T[];
  columns: Column<T>[];
  keyOf: (row: T) => string;
  /// What a row is called, for VoiceOver.
  titleOf: (row: T) => string;
  onPress: (row: T) => void;
  /// The row's menu, the desktop's right click.
  onLongPress?: (row: T) => void;
  /// The key of the row open beside the list.
  selected?: string;
  initialSort?: TableSort | null;
  /// Wraps a drawn row (its swipe actions, D76).
  wrapRow?: (row: T, node: ReactNode) => ReactNode;
  /// A row's own buttons at its end (Restore, Delete Forever), beside the row's button
  /// rather than in it, so VoiceOver reaches each; `width` keeps the headings over them.
  trailing?: { width: number; render: (row: T) => ReactNode };
  /// "fixed" keeps the headings above the scrolling page; "inline" draws them over the rows,
  /// for a page of several tables (one per group).
  headings?: "fixed" | "inline";
}) {
  const width = usePageWidth();
  const { row: rowHeight } = useScale();
  const [sort, setSort] = useState<TableSort | null>(initialSort);
  const stacked = width < STACK_BELOW;
  const shown = columns.filter((c) => !c.hideBelow || width >= c.hideBelow);
  const inline = stacked ? shown.filter((c) => c.width === "fill") : shown;
  const under = stacked ? shown.filter((c) => c.width !== "fill") : [];
  const sorted = sortRows(rows, columns, sort);
  const tap = (id: string) =>
    setSort((now) => (now?.id === id ? { id, desc: !now.desc } : { id, desc: false }));
  const headingRow = (
    <View className={cn("flex-row items-center gap-3 px-3", ROW_DIVIDER)}>
      {inline.map((column) => (
        <Heading
          key={column.id}
          column={column}
          sort={sort?.id === column.id ? sort : null}
          onPress={column.sortValue ? () => tap(column.id) : undefined}
        />
      ))}
      {trailing ? <View style={{ width: trailing.width }} /> : null}
    </View>
  );
  return (
    <View accessibilityLabel={label}>
      {headings === "fixed" ? <FixedTop>{headingRow}</FixedTop> : headingRow}
      {sorted.map((row) => {
        const key = keyOf(row);
        const on = key === selected;
        const button = (
          <PointerPressable
            accessibilityRole="button"
            accessibilityLabel={titleOf(row)}
            accessibilityHint="Opens it"
            accessibilityState={{ selected: on }}
            onPress={() => onPress(row)}
            onLongPress={onLongPress ? () => onLongPress(row) : undefined}
            onSecondary={onLongPress ? () => onLongPress(row) : undefined}
            hoverClassName={on ? "" : "bg-accent/50"}
            style={{ minHeight: rowHeight }}
            className={cn("flex-1 justify-center gap-0.5 px-3 py-1", !on && "active:bg-accent/50")}
          >
            <View className="flex-row items-center gap-3">
              {inline.map((column) => (
                <Cell key={column.id} column={column}>
                  {column.render(row)}
                </Cell>
              ))}
            </View>
            {under.length > 0 ? (
              <View className="flex-row flex-wrap items-center gap-x-3">
                {under.map((column) => (
                  <View key={column.id}>{column.render(row)}</View>
                ))}
              </View>
            ) : null}
          </PointerPressable>
        );
        const node = (
          <View
            key={key}
            className={cn("flex-row items-center overflow-hidden rounded-md", on && "bg-accent")}
          >
            {button}
            {trailing ? (
              <View className="flex-row justify-end" style={{ width: trailing.width }}>
                {trailing.render(row)}
              </View>
            ) : null}
          </View>
        );
        return wrapRow ? <View key={key}>{wrapRow(row, node)}</View> : node;
      })}
    </View>
  );
}

function Cell({
  column,
  children,
}: {
  column: Pick<Column<never>, "width" | "align">;
  children: ReactNode;
}) {
  return (
    <View
      className={cn("min-w-0", column.align === "end" && "items-end")}
      style={column.width === "fill" ? { flex: 1 } : { width: column.width }}
    >
      {children}
    </View>
  );
}

function Heading<T>({
  column,
  sort,
  onPress,
}: {
  column: Column<T>;
  sort: TableSort | null;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const muted = theme.colors.mutedForeground;
  const text = (
    <Text variant="label" tone="muted" numberOfLines={1}>
      {column.label}
    </Text>
  );
  const style = column.width === "fill" ? { flex: 1 } : { width: column.width };
  if (!onPress) {
    return (
      <View
        style={[style, { minHeight: MIN_TOUCH }]}
        className={cn("justify-center", column.align === "end" && "items-end")}
      >
        {text}
      </View>
    );
  }
  const Icon = sort ? (sort.desc ? IconChevronDown : IconChevronUp) : IconSelector;
  const state = sort ? (sort.desc ? ", sorted descending" : ", sorted ascending") : "";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${column.label}${state}`}
      onPress={onPress}
      style={[style, { minHeight: MIN_TOUCH }]}
      className={cn(
        "flex-row items-center gap-1 active:opacity-60",
        column.align === "end" && "justify-end",
      )}
    >
      {text}
      <Icon size={14} color={muted} style={{ opacity: sort ? 1 : 0.6 }} />
    </Pressable>
  );
}
