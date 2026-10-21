import { INPUT_CLASSES } from "@nookly/ui/classes";
import { IconCheck, IconPlus, IconSearch } from "@tabler/icons-react-native";
import { type ReactNode, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { cn, row, splitText } from "../classes.ts";
import { Text } from "../Text.tsx";
import { useTheme } from "../theme.ts";
import { FIELD_HEIGHT, TOUCH_ROW } from "../touch.ts";
import { useSheet } from "./Sheet.tsx";

/// One choice in a list: what it is called, and an icon or color dot beside it.
export interface Option<Id extends string = string> {
  id: Id;
  label: string;
  icon?: ReactNode;
  /// Words that also find it in the search.
  keywords?: string[];
  /// A line drawn above it, the desktop's `separatorBefore`.
  separatorBefore?: boolean;
}

/// Lists longer than this get a search field, as the desktop's searchable selects do.
const SEARCH_FROM = 9;

/// The desktop's option list (the `Command` list in a select or a property popover) as a
/// sheet's content: rows with the icon, the label and a check on the chosen one. One of a
/// set closes the sheet when tapped; several of a set (`multiple`) stay open to tap more.
/// `onCreate` adds a row that makes what was searched for (a new label).
export function OptionList<Id extends string>(
  props: {
    label: string;
    options: Option<Id>[];
    searchPlaceholder?: string;
    onCreate?: (name: string) => void;
    /// Always offer the search field (a list that can grow, like labels).
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
  const { label, options, searchPlaceholder = "Search…", onCreate } = props;
  const sheet = useSheet();
  const theme = useTheme();
  const [query, setQuery] = useState("");
  const searching = props.search || onCreate !== undefined || options.length >= SEARCH_FROM;
  const words = query.trim().toLowerCase();
  const shown = words
    ? options.filter((o) =>
        [o.label, ...(o.keywords ?? [])].some((k) => k.toLowerCase().includes(words)),
      )
    : options;
  const exact = options.some((o) => o.label.toLowerCase() === words);
  const chosen = (id: Id) => (props.multiple ? props.values.includes(id) : props.value === id);
  const input = splitText(row(INPUT_CLASSES));
  return (
    <View className="gap-2">
      {searching ? (
        <View className={cn(input.box, "items-center gap-2")} style={FIELD_HEIGHT}>
          <IconSearch size={16} color={theme.colors.mutedForeground} />
          <TextInput
            accessibilityLabel={`Search ${label}`}
            value={query}
            onChangeText={setQuery}
            placeholder={searchPlaceholder}
            placeholderTextColor={theme.colors.mutedForeground}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={() => {
              if (onCreate && words && !exact) {
                onCreate(query.trim());
                setQuery("");
              }
            }}
            className={cn(input.text, "h-full flex-1 font-sans text-foreground")}
          />
        </View>
      ) : null}
      <View
        accessibilityRole={props.multiple ? undefined : "radiogroup"}
        accessibilityLabel={label}
        className="-mx-2"
      >
        {shown.map((option) => {
          const on = chosen(option.id);
          return (
            <View key={option.id}>
              {option.separatorBefore && !words ? (
                <View className="mx-1 my-1 h-px bg-border" />
              ) : null}
              <Pressable
                accessibilityRole={props.multiple ? "checkbox" : "radio"}
                accessibilityLabel={option.label}
                accessibilityState={{ checked: on }}
                style={TOUCH_ROW}
                onPress={() => {
                  if (props.multiple) {
                    props.onToggle(option.id, !on);
                    return;
                  }
                  if (!on) props.onChange(option.id);
                  if (props.afterPick) props.afterPick();
                  else sheet?.close();
                }}
                className="flex-row items-center gap-3 rounded-md px-3 active:bg-accent"
              >
                {option.icon}
                <Text numberOfLines={1} className="flex-1">
                  {option.label}
                </Text>
                {on ? <IconCheck size={16} color={theme.colors.primary} /> : null}
              </Pressable>
            </View>
          );
        })}
        {onCreate && words && !exact ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Create ${query.trim()}`}
            style={TOUCH_ROW}
            onPress={() => {
              onCreate(query.trim());
              setQuery("");
            }}
            className="flex-row items-center gap-3 rounded-md px-3 active:bg-accent"
          >
            <IconPlus size={16} color={theme.colors.mutedForeground} />
            <Text numberOfLines={1} className="flex-1">
              {`Create "${query.trim()}"`}
            </Text>
          </Pressable>
        ) : null}
        {shown.length === 0 && !(onCreate && words) ? (
          <Text tone="muted" className="py-6 text-center">
            No matches.
          </Text>
        ) : null}
      </View>
    </View>
  );
}
