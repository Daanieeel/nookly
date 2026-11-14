import { IconCheck, IconPlus, IconSearch } from "@tabler/icons-react-native";
import { type ReactNode, useState } from "react";
import { Pressable, View } from "react-native";
import { runOnJS, useAnimatedReaction, useSharedValue } from "react-native-reanimated";
import { haptic } from "../haptics.ts";
import type { GlyphIcon } from "../kit/Glyph.tsx";
import { SectionHeader } from "../kit/GroupedSection.tsx";
import { Glyph } from "../kit/Glyph.tsx";
import { useScheme } from "../kit/scheme.ts";
import { Text } from "../Text.tsx";
import { useTheme } from "../theme.ts";
import { SearchField } from "../kit/SearchField.tsx";
import { EmptyState } from "../kit/States.tsx";
import { CORNER, TYPE, type TintName, tint as tintOf } from "../tokens.ts";
import { SheetPinned, useSheet, useSheetScroll } from "./Sheet.tsx";

/// One choice in a list: what it is called, its icon, and the desktop's details.
export interface Option<Id extends string = string> {
  id: Id;
  label: string;
  /// An icon of its own (a status's mark, a Space's icon, a colour dot), drawn on a badge.
  icon?: ReactNode;
  /// One of the desktop's icons for the badge instead.
  glyph?: GlyphIcon;
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

/// What a row starts with: the option's own mark, or the desktop's icon in its tint,
/// drawn plain as Linear does, no badge behind it.
function LeadingIcon({ option }: { option: Option }) {
  const scheme = useScheme();
  const theme = useTheme();
  if (option.icon) return <View style={LEAD}>{option.icon}</View>;
  if (!option.glyph) return null;
  const color = option.tint ? tintOf(option.tint, scheme) : theme.colors.mutedForeground;
  return (
    <View style={LEAD}>
      <Glyph icon={option.glyph} size={22} color={color} />
    </View>
  );
}

const LEAD = {
  width: 24,
  alignItems: "center",
  justifyContent: "center",
} as const;

/// One choice as Linear's pickers draw it: a big row with its icon, the title in body
/// text, a muted subtitle or detail, and a plain check on the right for the chosen one.
function PickerRow({
  option,
  selected,
  role,
  onPress,
  accessibilityLabel,
}: {
  option: Option;
  selected: boolean;
  role: "radio" | "checkbox" | "button";
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={
        accessibilityLabel ??
        [option.label, option.subtitle, option.detail].filter(Boolean).join(", ")
      }
      accessibilityState={role === "button" ? undefined : { checked: selected, selected }}
      onPress={onPress}
      style={[CORNER, { minHeight: ROW_HEIGHT }]}
      className="flex-row items-center gap-3.5 rounded-xl px-3 active:bg-accent"
    >
      <LeadingIcon option={option} />
      <View className="flex-1 py-2">
        <Text numberOfLines={1} style={BODY}>
          {option.label}
        </Text>
        {option.subtitle ? (
          <Text numberOfLines={1} tone="muted" className="text-sm">
            {option.subtitle}
          </Text>
        ) : null}
      </View>
      {option.detail ? (
        <Text numberOfLines={1} tone="muted" className="text-sm">
          {option.detail}
        </Text>
      ) : null}
      {role === "button" ? null : (
        <View style={{ width: 22 }}>
          {selected ? <IconCheck size={20} color={theme.colors.foreground} /> : null}
        </View>
      )}
    </Pressable>
  );
}

/// From how many choices a list gets its search field.
const SEARCH_FROM = 7;

/// Linear's rows: a finger and a bit tall.
const ROW_HEIGHT = 50;
const BODY = { fontSize: TYPE.body.fontSize, lineHeight: TYPE.body.lineHeight };

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
    /// Whether it has a search field; by default only a list longer than 7, or one that
    /// makes new choices or searches elsewhere.
    search?: boolean;
    /// Searches elsewhere (the item search): gets each query, and `options` are then shown
    /// as given, not filtered here.
    onQueryChange?: (query: string) => void;
    /// What an empty list says instead of No Results (before anything is searched).
    empty?: { title: string; message: string };
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
  const search = (next: string) => {
    setQuery(next);
    props.onQueryChange?.(next);
  };
  const shown =
    words && !props.onQueryChange
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
  // Linear searches a long list or one that grows (labels); a handful (a status) has none.
  const searchable =
    props.search ?? (options.length > SEARCH_FROM || !!onCreate || !!props.onQueryChange);
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
    search("");
  };
  const stuck = current.index === null ? undefined : groups[current.index]?.title;

  return (
    <View onLayout={current.onRootLayout}>
      {!searchable ? null : (
        <SheetPinned>
          <SearchField
            label={`Search ${label}`}
            value={query}
            onChangeText={search}
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
      >
        {groups.map((group, index) => (
          <View
            // oxlint-disable-next-line react/no-array-index-key -- groups are positional
            key={`${group.title ?? ""}-${index}`}
            onLayout={(event) => current.onSectionLayout(index, event.nativeEvent.layout.y)}
          >
            {group.title ? (
              <Text
                accessibilityRole="header"
                tone="muted"
                className="px-3 pb-1 pt-3 text-sm font-medium"
              >
                {group.title}
              </Text>
            ) : index > 0 ? (
              <View className="mx-3 my-1 h-px bg-border" />
            ) : null}
            {group.options.map((option) => (
              <PickerRow
                key={option.id}
                option={option}
                role={props.multiple ? "checkbox" : "radio"}
                selected={chosen(option.id)}
                onPress={() => pick(option)}
              />
            ))}
          </View>
        ))}
        {creating ? (
          <PickerRow
            option={{
              id: "create",
              label: `Create "${query.trim()}"`,
              glyph: IconPlus,
            }}
            role="button"
            accessibilityLabel={`Create ${query.trim()}`}
            selected={false}
            onPress={create}
          />
        ) : null}
        {shown.length === 0 && !creating ? (
          <EmptyState
            glyph={IconSearch}
            title={!words && props.empty ? props.empty.title : "No Results"}
            message={
              !words && props.empty
                ? props.empty.message
                : "Check the spelling or try a new search."
            }
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
