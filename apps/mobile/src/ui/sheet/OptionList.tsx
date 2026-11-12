import { IconMoodEmpty, IconPlus } from "@tabler/icons-react-native";
import { type ReactNode, useState } from "react";
import { View } from "react-native";
import { runOnJS, useAnimatedReaction, useSharedValue } from "react-native-reanimated";
import { haptic } from "../haptics.ts";
import type { FallbackIcon, SymbolName } from "../kit/Glyph.tsx";
import { GroupedSection, INSET, SectionHeader } from "../kit/GroupedSection.tsx";
import { IconBadge } from "../kit/IconBadge.tsx";
import { ListRow } from "../kit/ListRow.tsx";
import { SearchField } from "../kit/SearchField.tsx";
import { EmptyState } from "../kit/States.tsx";
import type { TintName } from "../tokens.ts";
import { SheetPinned, useSheet, useSheetScroll } from "./Sheet.tsx";

/// One choice in a list: what it is called, its icon, and the desktop's details.
export interface Option<Id extends string = string> {
  id: Id;
  label: string;
  /// An icon of its own (a status's mark, a Space's icon, a colour dot), drawn on a badge.
  icon?: ReactNode;
  /// An SF Symbol for the badge instead, with its Tabler twin.
  symbol?: SymbolName;
  fallbackIcon?: FallbackIcon;
  /// The badge's tint: one of Nookly's, or a colour of its own.
  tint?: TintName | string;
  /// A line under the label (the desktop's secondary text: a course, a key, a description).
  subtitle?: string;
  /// Muted text at the row's end, as the desktop shows beside a choice (a date, a count).
  detail?: string;
  /// Words that also find it in the search.
  keywords?: string[];
  /// The group it is listed under, with this header.
  section?: string;
  /// Starts a new group without a header, the desktop's `separatorBefore`.
  separatorBefore?: boolean;
}

interface Group<Id extends string> {
  title?: string;
  options: Option<Id>[];
}

/// Options in their groups, in order: a new group at each new section or separator.
export function groupOptions<Id extends string>(options: Option<Id>[]): Group<Id>[] {
  const groups: Group<Id>[] = [];
  for (const option of options) {
    const last = groups.at(-1);
    if (last && option.section === last.title && !option.separatorBefore) {
      last.options.push(option);
    } else {
      groups.push({ title: option.section, options: [option] });
    }
  }
  return groups;
}

function badgeOf(option: Option): ReactNode {
  if (option.symbol && option.fallbackIcon) {
    return <IconBadge symbol={option.symbol} fallback={option.fallbackIcon} tint={option.tint} />;
  }
  if (option.icon) return <IconBadge icon={option.icon} tint={option.tint ?? "gray"} />;
  return undefined;
}

/// The desktop's option list (the `Command` list in a select or a property popover) as
/// iOS draws a picker (D50): a search pinned above the list, the choices in grouped
/// sections with their headers, each row an icon, a title and a subtitle with the
/// desktop's details, and a check on the chosen one. One of a set closes the sheet when
/// tapped; several of a set (`multiple`) stay open to tap more. `onCreate` adds a row that
/// makes what was searched for (a new label).
export function OptionList<Id extends string>(
  props: {
    label: string;
    options: Option<Id>[];
    searchPlaceholder?: string;
    onCreate?: (name: string) => void;
    /// `false` leaves the search out (a list that is only ever two or three long and fixed).
    search?: boolean;
  } & (
    | {
        multiple?: false;
        value: Id | null;
        onChange: (id: Id) => void;
        /// What happens once one is picked; the sheet closes unless this says otherwise
        /// (a step goes back to the one before).
        afterPick?: () => void;
      }
    | { multiple: true; values: Id[]; onToggle: (id: Id, on: boolean) => void }
  ),
) {
  const { label, options, searchPlaceholder = "Search", onCreate } = props;
  const sheet = useSheet();
  const [query, setQuery] = useState("");
  const words = query.trim().toLowerCase();
  const shown = words
    ? options.filter((o) =>
        [o.label, o.subtitle ?? "", ...(o.keywords ?? [])].some((k) =>
          k.toLowerCase().includes(words),
        ),
      )
    : options;
  const exact = options.some((o) => o.label.toLowerCase() === words);
  const creating = onCreate !== undefined && words !== "" && !exact;
  const chosen = (id: Id) => (props.multiple ? props.values.includes(id) : props.value === id);
  const groups = groupOptions(shown);
  const inset = options.some((o) => o.icon || o.symbol) ? INSET.badge : INSET.plain;
  const current = useStuckSection(groups.length);

  const pick = (option: Option<Id>) => {
    haptic("select");
    if (props.multiple) {
      props.onToggle(option.id, !chosen(option.id));
      return;
    }
    if (!chosen(option.id)) props.onChange(option.id);
    if (props.afterPick) props.afterPick();
    else sheet?.close();
  };
  const create = () => {
    if (!creating) return;
    onCreate?.(query.trim());
    setQuery("");
  };
  const stuck = current.index === null ? undefined : groups[current.index]?.title;

  return (
    <View onLayout={current.onRootLayout}>
      {props.search === false ? null : (
        <SheetPinned>
          <SearchField
            label={`Search ${label}`}
            value={query}
            onChangeText={setQuery}
            placeholder={searchPlaceholder}
            onSubmit={onCreate ? create : undefined}
          />
          {stuck ? (
            <View style={{ marginHorizontal: -16 }}>
              <SectionHeader title={stuck} sticky />
            </View>
          ) : null}
        </SheetPinned>
      )}
      <View
        accessibilityRole={props.multiple ? undefined : "radiogroup"}
        accessibilityLabel={label}
        style={{ gap: 8 }}
      >
        {groups.map((group, index) => (
          <GroupedSection
            // oxlint-disable-next-line react/no-array-index-key -- groups are positional
            key={`${group.title ?? ""}-${index}`}
            title={group.title}
            inset={inset}
            margin={0}
            onLayout={(event) => current.onSectionLayout(index, event.nativeEvent.layout.y)}
          >
            {group.options.map((option) => (
              <ListRow
                key={option.id}
                accessibilityRole={props.multiple ? "checkbox" : "radio"}
                badge={badgeOf(option)}
                title={option.label}
                subtitle={option.subtitle}
                detail={option.detail}
                accessory="check"
                selected={chosen(option.id)}
                onPress={() => pick(option)}
              />
            ))}
          </GroupedSection>
        ))}
        {creating ? (
          <GroupedSection margin={0} inset={INSET.badge}>
            <ListRow
              badge={<IconBadge symbol="plus" fallback={IconPlus} tint="blue" />}
              title={`Create "${query.trim()}"`}
              accessibilityLabel={`Create ${query.trim()}`}
              onPress={create}
            />
          </GroupedSection>
        ) : null}
        {shown.length === 0 && !creating ? (
          <EmptyState
            symbol="magnifyingglass"
            fallback={IconMoodEmpty}
            title="No Results"
            message="Check the spelling or try a new search."
          />
        ) : null}
      </View>
    </View>
  );
}

/// Which section's header has scrolled up under the pinned search, so it stays shown
/// there as iOS's sticky headers do. Only in a sheet, which reports its scroll.
function useStuckSection(count: number) {
  const scroll = useSheetScroll();
  const [index, setIndex] = useState<number | null>(null);
  const root = useSharedValue(0);
  const tops = useSharedValue<number[]>([]);
  useAnimatedReaction(
    () => {
      if (!scroll) return null;
      const y = scroll.value;
      let found: number | null = null;
      for (let i = 0; i < Math.min(count, tops.value.length); i += 1) {
        if (root.value + (tops.value[i] ?? Infinity) < y) found = i;
      }
      return found;
    },
    (next, previous) => {
      if (next !== previous) runOnJS(setIndex)(next);
    },
    [count],
  );
  return {
    index,
    onRootLayout: (event: { nativeEvent: { layout: { y: number } } }) => {
      root.value = event.nativeEvent.layout.y;
    },
    onSectionLayout: (at: number, y: number) => {
      const next = [...tops.value];
      next[at] = y;
      tops.value = next;
    },
  };
}
