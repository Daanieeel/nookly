import { INPUT_CLASSES } from "@nookly/ui/classes";
import { IconSearch } from "@tabler/icons-react-native";
import { TextInput, View } from "react-native";
import { cn, row, splitText } from "./classes.ts";
import { Chip, ChipGroup } from "./Chips.tsx";
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

/// The desktop's row of presets: a few views of one list, each with how many it holds.
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
  return (
    <ChipGroup label={label} scroll>
      {options.map((option) => (
        <Chip
          key={option.id}
          label={option.count === undefined ? option.label : `${option.label} ${option.count}`}
          selected={option.id === value}
          onPress={() => onChange(option.id)}
        />
      ))}
    </ChipGroup>
  );
}
