import { haptic } from "../haptics.ts";
import { IconChevronRight } from "@tabler/icons-react-native";
import { Children, type ComponentType, type ReactNode, useState } from "react";
import { Pressable, StyleSheet, Switch, View } from "react-native";
import { cn } from "../classes.ts";
import { Text } from "../Text.tsx";
import { useTheme } from "../theme.ts";
import { CORNER, TYPE } from "../tokens.ts";
import { useSemantic } from "../kit/scheme.ts";
import { InlineSelect } from "./InlineMenu.tsx";
import { TOUCH_ROW } from "../touch.ts";

/// Rows and tiles at the size of the sheet's menu items.
const BODY = { fontSize: TYPE.body.fontSize, lineHeight: TYPE.body.lineHeight };
/// Linear's grouped rows: a little taller than a finger.
const ROW = { minHeight: 52 };
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
              "active:opacity-60",
              "flex-1 items-center justify-center gap-1.5 rounded-2xl border border-transparent py-3",
              on ? "border-foreground/15 bg-accent" : "bg-muted/60",
            )}
          >
            <tile.icon
              size={24}
              color={on ? theme.colors.foreground : theme.colors.mutedForeground}
            />
            <Text tone={on ? "default" : "muted"} style={BODY}>
              {tile.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/// A row with a name and its value on the right: tapped, its choices grow out of the value
/// as Linear's menu does.
export function SelectRow<T extends string>(props: {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (id: T) => void;
}) {
  return <InlineSelect {...props} />;
}

/// Linear's grouped card in a sheet: its rows on one rounded surface with hairlines
/// between them.
export function DisplayGroup({ children }: { children: ReactNode }) {
  const surface = useSemantic("surface");
  const separator = useSemantic("separator");
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={[CORNER, { backgroundColor: surface, borderRadius: 20, overflow: "hidden" }]}>
      {rows.map((row, index) => (
        // oxlint-disable-next-line react/no-array-index-key -- rows are positional
        <View key={index}>
          {index > 0 ? (
            <View
              style={{
                height: StyleSheet.hairlineWidth,
                backgroundColor: separator,
              }}
            />
          ) : null}
          {row}
        </View>
      ))}
    </View>
  );
}

/// A row that opens a further step: a name, what is set, a chevron.
function NextRow({
  label,
  value,
  icon: Icon,
  onPress,
}: {
  label: string;
  value: string;
  icon?: ComponentType<{ size?: number; color?: string }>;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      onPress={onPress}
      style={ROW}
      className="flex-row items-center gap-3 px-4 active:bg-accent"
    >
      {Icon ? <Icon size={22} color={theme.colors.foreground} /> : null}
      <Text className="flex-1" style={BODY}>
        {label}
      </Text>
      <Text numberOfLines={1} tone="muted" style={[BODY, { maxWidth: "50%" }]}>
        {value}
      </Text>
      <IconChevronRight size={18} color={theme.colors.mutedForeground} />
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
    <View style={ROW} className="flex-row items-center gap-3 px-4">
      <Text className="flex-1" style={BODY}>
        {label}
      </Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={(next) => {
          haptic("toggle");
          onChange(next);
        }}
        trackColor={{ true: theme.colors.primary }}
      />
    </View>
  );
}

/// A field of the Filter sheet (Status, Labels, Course): its name and how many are on;
/// tapped, its options to tick, which stay open for more.
export function FilterField<T extends string>({
  label,
  icon,
  options,
  values,
  onChange,
}: {
  label: string;
  /// The desktop's icon for the field, as Linear's filter list draws one per row.
  icon?: ComponentType<{ size?: number; color?: string }>;
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
      icon={icon}
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
