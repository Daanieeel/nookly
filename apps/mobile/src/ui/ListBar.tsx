import { INPUT_CLASSES } from "@nookly/ui/classes";
import { IconAdjustmentsHorizontal, IconFilter, IconSearch } from "@tabler/icons-react-native";
import { Button } from "./Button.tsx";
import { TextInput, View } from "react-native";
import { cn, row, splitText } from "./classes.ts";
import { PageTabs } from "./PageTabs.tsx";
import { Text } from "./Text.tsx";
import { useTheme } from "./theme.ts";

/// The field above a page's list that narrows it as you type: "Filter notes".
export function FilterField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
}) {
  const theme = useTheme();
  const { box, text } = splitText(row(INPUT_CLASSES));
  return (
    <View className={cn(box, "gap-2")}>
      <IconSearch size={16} color={theme.colors.mutedForeground} />
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={label}
        placeholderTextColor={theme.colors.mutedForeground}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
        className={cn(text, "flex-1 font-sans text-foreground")}
      />
    </View>
  );
}

/// A page's title with how many it lists, the line the desktop's header gives it.
export function ListTitle({ title, count }: { title: string; count: number }) {
  return (
    <View className="flex-row items-baseline gap-2 px-1">
      <Text variant="title" accessibilityRole="header">
        {title}
      </Text>
      <Text tone="muted">{count}</Text>
    </View>
  );
}

export type ListPanel = "filter" | "display" | null;

/// A list page's header, as the desktop's: the title with how many it lists, and Filter
/// and Display on the right, each opening its sheet.
export function ListHeader({
  title,
  count,
  panel,
  onPanel,
  display = true,
}: {
  title: string;
  count: number;
  panel: ListPanel;
  onPanel: (next: ListPanel) => void;
  /// Whether the page has display options; without, only Filter shows.
  display?: boolean;
}) {
  const theme = useTheme();
  const toggle = (which: Exclude<ListPanel, null>) => onPanel(panel === which ? null : which);
  return (
    // With large text the buttons go under the title rather than squeeze it.
    <View className="flex-row flex-wrap items-center gap-2">
      <View style={{ flexGrow: 1, flexShrink: 0, maxWidth: "100%" }}>
        <ListTitle title={title} count={count} />
      </View>
      <Button
        label="Filter"
        variant="secondary"
        size="sm"
        icon={<IconFilter size={16} color={theme.colors.foreground} />}
        onPress={() => toggle("filter")}
      />
      {display ? (
        <Button
          label="Display"
          variant="secondary"
          size="sm"
          icon={<IconAdjustmentsHorizontal size={16} color={theme.colors.foreground} />}
          onPress={() => toggle("display")}
        />
      ) : null}
    </View>
  );
}

/// The desktop's row of presets: a few views of one list, each with how many it holds, as
/// the desktop's quiet page tabs.
export function Presets<Id extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: Id; label: string; count?: number }[];
  value: Id;
  onChange: (id: Id) => void;
}) {
  return <PageTabs label={label} tabs={options} value={value} onChange={onChange} />;
}
