import { haptic } from "../haptics.ts";
import { IconChevronRight } from "@tabler/icons-react-native";
import { Children, type ComponentType, type ReactNode, useState } from "react";
import { Pressable, StyleSheet, Switch, View } from "react-native";
import { cn } from "../classes.ts";
import { Text } from "../Text.tsx";
import { useTheme } from "../theme.ts";
import {
  CORNER,
  PRIMARY,
  SPACE,
  TINT_FILL,
  TYPE,
  type TintName,
  elevation,
  tint,
  withAlpha,
} from "../tokens.ts";
import { IconBadge } from "../kit/IconBadge.tsx";
import { useControlStyle, useScheme, useSemantic } from "../kit/scheme.ts";
import { InlineSelect } from "./InlineMenu.tsx";
import { TOUCH_ROW } from "../touch.ts";

/// Rows and tiles at the size of the sheet's menu items.
const BODY = { fontSize: TYPE.body.fontSize, lineHeight: TYPE.body.lineHeight };
/// Linear's grouped rows: a little taller than a finger.
const ROW = { minHeight: 56 };
import { type Option, OptionList } from "./OptionList.tsx";
import { Sheet } from "./Sheet.tsx";

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
  const control = useControlStyle();
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
            style={[TOUCH_ROW, control]}
            className={cn(
              "active:opacity-60",
              "flex-1 items-center justify-center gap-1.5 rounded-2xl py-3",
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

/// The sheet's rows, each on a raised card of its own with a little room between, so a
/// row reads as one thing to touch and never as a line in a slab.
export function DisplayGroup({ children }: { children: ReactNode }) {
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View testID="display-group" style={{ gap: SPACE.sm }}>
      {rows.map((row, index) => (
        // oxlint-disable-next-line react/no-array-index-key -- rows are positional
        <DisplayCard key={index}>{row}</DisplayCard>
      ))}
    </View>
  );
}

function DisplayCard({ children }: { children: ReactNode }) {
  const surface = useSemantic("sheetCard");
  const edge = useSemantic("controlEdge");
  const scheme = useScheme();
  return (
    <View
      testID="display-card"
      style={[
        CORNER,
        elevation("control", scheme),
        {
          backgroundColor: surface,
          borderRadius: 20,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: edge,
          overflow: "hidden",
        },
      ]}
    >
      {children}
    </View>
  );
}

/// A field's own tint, the same each time, so a list of filters is not one grey column.
const FIELD_TINTS = ["blue", "green", "purple", "pink", "yellow", "red"] as const;
function fieldTint(label: string): TintName {
  let sum = 0;
  for (const ch of label) sum += ch.codePointAt(0) ?? 0;
  return FIELD_TINTS[sum % FIELD_TINTS.length] ?? "blue";
}

/// A row that opens a further step: the field's icon on a tinted badge, its name, what is
/// set (a chip in the primary colour once something is chosen) and a chevron.
function NextRow({
  label,
  value,
  active,
  icon: Icon,
  onPress,
}: {
  label: string;
  value: string;
  active: boolean;
  icon?: ComponentType<{ size?: number; color?: string }>;
  onPress: () => void;
}) {
  const theme = useTheme();
  const scheme = useScheme();
  const color = tint(fieldTint(label), scheme);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      onPress={onPress}
      style={ROW}
      className="flex-row items-center gap-3 px-3 active:bg-accent"
    >
      {Icon ? <IconBadge tint={fieldTint(label)} icon={<Icon size={20} color={color} />} /> : null}
      <Text className="flex-1" style={BODY}>
        {label}
      </Text>
      {active ? (
        <View
          style={{
            borderRadius: 999,
            paddingHorizontal: SPACE.md,
            paddingVertical: SPACE.xs,
            backgroundColor: withAlpha(PRIMARY, TINT_FILL[scheme]),
          }}
        >
          <Text numberOfLines={1} style={[BODY, { color: tint("blue", scheme), maxWidth: 160 }]}>
            {value}
          </Text>
        </View>
      ) : (
        <Text numberOfLines={1} tone="muted" style={[BODY, { maxWidth: "50%" }]}>
          {value}
        </Text>
      )}
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
      {/* iOS 26 draws a bare switch at the top of a taller row; in a box of its own it
          centres on its label. */}
      <View testID="switch-box" style={{ alignSelf: "center" }}>
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
    </View>
  );
}

/// A field of the Filter sheet (Status, Labels, Course): its name and how many are on;
/// tapped, its options to tick on a card, which stays open for more.
export function FilterField<T extends string>({
  label,
  icon,
  options,
  values,
  onChange,
  search,
}: {
  label: string;
  /// The desktop's icon for the field, as Linear's filter list draws one per row.
  icon?: ComponentType<{ size?: number; color?: string }>;
  options: Option<T>[];
  values: T[];
  onChange: (values: T[]) => void;
  /// Whether its choices get a search field; by default only a long list.
  search?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const shown =
    values.length === 0
      ? "Any"
      : values.length === 1
        ? (options.find((o) => o.id === values[0])?.label ?? "1")
        : `${values.length} chosen`;
  return (
    <>
      <NextRow
        label={label}
        icon={icon}
        value={shown}
        active={values.length > 0}
        onPress={() => setOpen(true)}
      />
      {/* A card over the Filter sheet, as a select opens, not a step covering it. */}
      <Sheet open={open} onOpenChange={setOpen} title={label} presentation="card">
        <FilterOptions
          label={label}
          options={options}
          values={values}
          onChange={onChange}
          search={search}
        />
      </Sheet>
    </>
  );
}

/// The card keeps the values it opened with unless it is told the new ones, so the list
/// holds its own as it is ticked.
export function FilterOptions<T extends string>({
  label,
  options,
  values,
  onChange,
  search,
}: {
  label: string;
  options: Option<T>[];
  values: T[];
  onChange: (values: T[]) => void;
  search?: boolean;
}) {
  // Ticks of its own, so quick taps build on each other before the page catches up; a change
  // made elsewhere (Discard, Clear Filters, a chip's X) replaces them.
  const [ticked, setTicked] = useState(values);
  const [given, setGiven] = useState(values);
  if (given !== values && given.join("\n") !== values.join("\n")) {
    setGiven(values);
    setTicked(values);
  }
  return (
    <OptionList
      label={label}
      multiple
      search={search}
      empty={{ title: `No ${label} Yet`, message: "Nothing here to filter by yet." }}
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
