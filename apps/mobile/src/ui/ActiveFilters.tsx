import { IconX } from "@tabler/icons-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Label } from "./kit/Label.tsx";
import { useControlStyle, useSemantic, useSemanticPair } from "./kit/scheme.ts";
import type { ListFilter } from "./ListControls.tsx";
import { FilterOptions } from "./sheet/DisplayParts.tsx";
import { Sheet } from "./sheet/Sheet.tsx";
import { useAnchor } from "./sheet/anchor.ts";
import { CORNER, RADIUS, SPACE } from "./tokens.ts";
import { MIN_TOUCH } from "./touch.ts";

/// How a field's filter reads: the values it matches, or, when it matches most of them, the
/// few it leaves out ("is not"). The phone keeps only what matches; "is not" is that read the
/// other way round, as the desktop's operator shows it.
export interface FilterReading {
  negated: boolean;
  shown: string[];
}

/// An even split (half the choices picked) reads either way; it reads as `turned` says, the
/// way the person last turned it.
export function operatorOf(filter: ListFilter, turned = false): FilterReading {
  const rest = filter.options.map((o) => o.id).filter((id) => !filter.values.includes(id));
  const negated =
    rest.length > 0 &&
    (rest.length < filter.values.length || (turned && rest.length === filter.values.length));
  return { negated, shown: negated ? rest : filter.values };
}

function words(negated: boolean, count: number): string {
  if (count > 1) return negated ? "is none of" : "is any of";
  return negated ? "is not" : "is";
}

/// The filters that are on, as the desktop's chips (D75): one per field, its icon and name,
/// how it matches (a tap turns "is" into "is not" and back), what it matches (a tap opens its
/// choices) and a way to take it off. Each spans the page, one under the other, so many never
/// crowd it.
export function ActiveFilters({ filters }: { filters: ListFilter[] }) {
  const on = filters.filter((f) => f.values.length > 0);
  if (on.length === 0) return null;
  return (
    <View accessibilityLabel="Active filters" style={{ gap: SPACE.sm }}>
      {on.map((filter) => (
        <FilterChip key={filter.label} filter={filter} />
      ))}
    </View>
  );
}

function FilterChip({ filter }: { filter: ListFilter }) {
  const [open, setOpen] = useState(false);
  const anchor = useAnchor();
  // Which way the chip was last turned, for an even split that reads either way.
  const [turned, setTurned] = useState(false);
  const control = useControlStyle();
  const separator = useSemantic("separator");
  const muted = useSemanticPair("secondaryLabelSolid");
  const pressed = useSemantic("pressed");
  const { negated, shown } = operatorOf(filter, turned);
  const names = shown.map((id) => filter.options.find((o) => o.id === id)?.label ?? id);
  const text = names.join(", ");
  const operator = words(negated, shown.length);
  const other = words(!negated, shown.length);
  const rest = filter.options.map((o) => o.id).filter((id) => !filter.values.includes(id));
  const Icon = filter.icon;
  const segment = { justifyContent: "center", paddingHorizontal: SPACE.md } as const;
  const divider = { borderLeftWidth: 1, borderLeftColor: separator } as const;
  return (
    <View
      testID="filter-chip"
      style={[
        CORNER,
        {
          alignSelf: "stretch",
          minHeight: MIN_TOUCH,
          flexDirection: "row",
          borderRadius: RADIUS.control,
          overflow: "hidden",
        },
        control,
      ]}
    >
      <View style={[segment, { flexDirection: "row", alignItems: "center", gap: SPACE.xs + 2 }]}>
        {Icon ? <Icon size={16} color={muted.hex} /> : null}
        <Label type="subheadline" color="secondaryLabelSolid" numberOfLines={1}>
          {filter.label}
        </Label>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${filter.label} ${operator} ${text}. Switch to ${other}`}
        // Every option picked reads the same both ways round; there is nothing to flip.
        disabled={rest.length === 0}
        onPress={() => {
          setTurned(!negated);
          filter.onChange(rest);
        }}
        style={({ pressed: down }) => [segment, divider, down && { backgroundColor: pressed }]}
      >
        <Label type="subheadline" numberOfLines={1}>
          {operator}
        </Label>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        ref={anchor.ref}
        accessibilityLabel={`${filter.label}: ${text}`}
        onPress={() => setOpen(true)}
        style={({ pressed: down }) => [
          segment,
          divider,
          { flex: 1 },
          down && { backgroundColor: pressed },
        ]}
      >
        <Label type="subheadline" weight="600" numberOfLines={1}>
          {text}
        </Label>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove ${filter.label} Filter`}
        onPress={() => filter.onChange([])}
        style={({ pressed: down }) => [
          divider,
          { width: MIN_TOUCH, alignItems: "center", justifyContent: "center" },
          down && { backgroundColor: pressed },
        ]}
      >
        <IconX size={16} color={muted.hex} />
      </Pressable>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={filter.label}
        presentation="card"
        kind="picker"
        anchor={anchor}
      >
        <FilterOptions
          label={filter.label}
          options={filter.options}
          values={filter.values}
          onChange={filter.onChange}
          search={filter.search}
        />
      </Sheet>
    </View>
  );
}
