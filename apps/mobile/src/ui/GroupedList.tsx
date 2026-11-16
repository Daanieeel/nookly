import { IconCaretDownFilled, IconCaretRightFilled, IconPlus } from "@tabler/icons-react-native";
import { Fragment, type ReactNode, useState } from "react";
import { Pressable, View } from "react-native";
import { IconButton } from "./Button.tsx";
import { cn } from "./classes.ts";
import { Text } from "./Text.tsx";
import { useTheme } from "./theme.ts";
import { MIN_TOUCH } from "./touch.ts";

/// One group of a list (a status, a due date bucket), as the desktop's `ViewGroup`.
export interface ListGroup<T> {
  id: string;
  name: string;
  icon?: ReactNode;
  /// Starts folded, for groups that only hold finished work.
  defaultCollapsed?: boolean;
  items: T[];
  /// Its sub groups, empty ones included; `null` without sub grouping.
  subgroups: ListGroup<T>[] | null;
}

/// The desktop's grouped list (`grouped-list.tsx`) for a tablet (3.4): each group under a
/// header with its count that folds it away on a tap, sub groups nested under it, and a
/// button to create an item in a group. Only what someone folded is remembered here.
export function GroupedList<T>({
  groups,
  keyOf,
  renderRow,
  onCreateIn,
  createLabel = (name) => `New in ${name}`,
}: {
  groups: ListGroup<T>[];
  keyOf: (item: T) => string;
  renderRow: (item: T) => ReactNode;
  /// How to create an item in a group (and sub group), or nothing where none can go.
  onCreateIn?: (group: ListGroup<T>, sub: ListGroup<T> | null) => (() => void) | undefined;
  createLabel?: (name: string) => string;
}) {
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(new Set());
  const folded = (id: string, start: boolean | undefined) => flipped.has(id) !== Boolean(start);
  const flip = (id: string) =>
    setFlipped((now) => {
      const next = new Set(now);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const rows = (items: T[]) =>
    items.map((item) => <Fragment key={keyOf(item)}>{renderRow(item)}</Fragment>);
  return (
    <View>
      {groups.map((group) => {
        const closed = folded(group.id, group.defaultCollapsed);
        return (
          <View key={group.id} accessibilityLabel={group.name}>
            <GroupHeader
              group={group}
              closed={closed}
              onToggle={() => flip(group.id)}
              onCreate={onCreateIn?.(group, null)}
              createLabel={createLabel(group.name)}
            />
            {closed
              ? null
              : group.subgroups
                ? group.subgroups
                    .filter((sub) => sub.items.length > 0)
                    .map((sub) => {
                      const id = `${group.id}/${sub.id}`;
                      const subClosed = folded(id, sub.defaultCollapsed);
                      return (
                        <View key={sub.id} accessibilityLabel={`${group.name}, ${sub.name}`}>
                          <GroupHeader
                            group={sub}
                            closed={subClosed}
                            onToggle={() => flip(id)}
                            onCreate={onCreateIn?.(group, sub)}
                            createLabel={createLabel(sub.name)}
                            nested
                          />
                          {subClosed ? null : rows(sub.items)}
                        </View>
                      );
                    })
                : rows(group.items)}
          </View>
        );
      })}
    </View>
  );
}

function GroupHeader<T>({
  group,
  closed,
  onToggle,
  onCreate,
  createLabel,
  nested = false,
}: {
  group: ListGroup<T>;
  closed: boolean;
  onToggle: () => void;
  onCreate: (() => void) | undefined;
  createLabel: string;
  nested?: boolean;
}) {
  const theme = useTheme();
  const muted = theme.colors.mutedForeground;
  const Caret = closed ? IconCaretRightFilled : IconCaretDownFilled;
  return (
    <View
      className={cn(
        "flex-row items-center gap-2 border-b px-2",
        nested ? "border-border/60 pl-6" : "border-border bg-foreground/5",
      )}
      style={{ minHeight: MIN_TOUCH }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${group.name}, ${group.items.length}`}
        accessibilityState={{ expanded: !closed }}
        onPress={onToggle}
        style={{ minHeight: MIN_TOUCH }}
        className="min-w-0 flex-1 flex-row items-center gap-2 px-2 active:opacity-60"
      >
        <Caret size={10} color={muted} />
        {group.icon}
        <Text numberOfLines={1} className={cn("font-medium", nested && "text-xs")}>
          {group.name}
        </Text>
        <Text tone="muted" className={cn("tabular-nums", nested && "text-xs")}>
          {group.items.length}
        </Text>
      </Pressable>
      {onCreate ? (
        <IconButton
          label={createLabel}
          size="iconSm"
          icon={<IconPlus size={14} color={muted} />}
          onPress={onCreate}
        />
      ) : null}
    </View>
  );
}
