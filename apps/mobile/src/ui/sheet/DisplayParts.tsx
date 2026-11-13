import { IconChevronRight } from "@tabler/icons-react-native";
import { type ComponentType, useState } from "react";
import { Pressable, Switch, View } from "react-native";
import { cn } from "../classes.ts";
import { Text } from "../Text.tsx";
import { useTheme } from "../theme.ts";
import { TOUCH_ROW } from "../touch.ts";
import { type Option, OptionList } from "./OptionList.tsx";
import { useSheet } from "./Sheet.tsx";

/// The pieces of the desktop's Display and Filter popovers (`display-menu.tsx`,
/// `filter-menu.tsx`), for the sheets that stand in for them.

/// The layout tiles: two side by side, an icon over a word, the chosen one filled.
export function LayoutTiles<T extends string>({
  tiles,
  value,
  onSelect,
}: {
  tiles: { id: T; label: string; icon: ComponentType<{ size?: number; color?: string }> }[];
  value: T;
  onSelect: (id: T) => void;
}) {
  const theme = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Layout" className="flex-row gap-2">
      {tiles.map((tile) => {
        const on = value === tile.id;
        return (
          <Pressable
            key={tile.id}
            accessibilityRole="radio"
            accessibilityLabel={tile.label}
            accessibilityState={{ checked: on }}
            onPress={() => onSelect(tile.id)}
            style={TOUCH_ROW}
            className={cn(
              "flex-1 items-center justify-center gap-1 rounded-md border border-border py-2",
              on && "border-foreground/20 bg-accent",
            )}
          >
            <tile.icon
              size={16}
              color={on ? theme.colors.foreground : theme.colors.mutedForeground}
            />
            <Text variant="small" tone={on ? "default" : "muted"}>
              {tile.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/// A row with a name and its value on the right: tapped, it shows its choices as the next
/// step of the sheet.
export function SelectRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (id: T) => void;
}) {
  const sheet = useSheet();
  const current = options.find((o) => o.id === value);
  return (
    <NextRow
      label={label}
      value={current?.label ?? ""}
      onPress={() =>
        sheet?.push({
          title: label,
          content: (
            <StepOptions label={label} value={value} options={options} onChange={onChange} />
          ),
        })
      }
    />
  );
}

/// The choices of a `SelectRow`: picking one goes back to the step before.
function StepOptions<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (id: T) => void;
}) {
  const sheet = useSheet();
  return (
    <View className="-mt-1">
      <OptionList
        label={label}
        value={value}
        options={options}
        onChange={onChange}
        afterPick={() => sheet?.back()}
      />
    </View>
  );
}

/// A row that opens a further step: a name, what is set, a chevron.
function NextRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      onPress={onPress}
      style={TOUCH_ROW}
      className="-mx-2 flex-row items-center gap-3 rounded-md px-2 active:bg-accent"
    >
      <Text tone="muted" className="flex-1">
        {label}
      </Text>
      <Text numberOfLines={1} style={{ maxWidth: "55%" }}>
        {value}
      </Text>
      <IconChevronRight size={16} color={theme.colors.mutedForeground} />
    </Pressable>
  );
}

/// A row with a name and the system's switch.
export function SwitchRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (on: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <View style={TOUCH_ROW} className="flex-row items-center gap-3">
      <Text tone="muted" className="flex-1">
        {label}
      </Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: theme.colors.primary }}
      />
    </View>
  );
}

/// A field of the Filter sheet (Status, Labels, Course): its name and how many are on;
/// tapped, its options to tick, which stay open for more.
export function FilterField<T extends string>({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: Option<T>[];
  values: T[];
  onChange: (values: T[]) => void;
}) {
  const sheet = useSheet();
  const shown =
    values.length === 0
      ? "Any"
      : values.length === 1
        ? (options.find((o) => o.id === values[0])?.label ?? "1")
        : `${values.length} chosen`;
  return (
    <NextRow
      label={label}
      value={shown}
      onPress={() =>
        sheet?.push({
          title: label,
          content: (
            <FilterOptions label={label} options={options} values={values} onChange={onChange} />
          ),
        })
      }
    />
  );
}

/// A pushed step keeps the values it opened with unless it is told the new ones, so the
/// list holds its own as it is ticked.
function FilterOptions<T extends string>({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: Option<T>[];
  values: T[];
  onChange: (values: T[]) => void;
}) {
  const [ticked, setTicked] = useState(values);
  return (
    <OptionList
      label={label}
      multiple
      options={options}
      values={ticked}
      onToggle={(id, on) => {
        const next = on ? [...ticked, id] : ticked.filter((v) => v !== id);
        setTicked(next);
        onChange(next);
      }}
    />
  );
}
