import { CARD_CLASSES } from "@nookly/ui/classes";
import { IconChevronDown, IconChevronRight, IconChevronUp } from "@tabler/icons-react-native";
import { Children, type ReactNode, createContext, useContext, useState } from "react";
import { Pressable, View } from "react-native";
import { cn } from "./classes.ts";
import { Text } from "./Text.tsx";
import { useTheme } from "./theme.ts";

/// An item's properties as one card of rows, like Linear's: each row a name and its value,
/// hairlines between them. Nothing floats on its own.
/// Which row of a list is open: one at a time, as in a menu.
const Open = createContext<{ open: string | null; toggle: (name: string) => void } | null>(null);

export function PropertyList({ children }: { children: ReactNode }) {
  const rows = Children.toArray(children);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Open.Provider
      value={{ open, toggle: (name) => setOpen((now) => (now === name ? null : name)) }}
    >
      <View className={cn(CARD_CLASSES, "gap-0 overflow-hidden py-0")}>
        {rows.map((row, index) => (
          <View
            // The rows are fixed in number and order.
            // oxlint-disable-next-line react/no-array-index-key
            key={index}
            className={index > 0 ? "border-t border-border/60" : undefined}
          >
            {row}
          </View>
        ))}
      </View>
    </Open.Provider>
  );
}

/// How a row asks its list to open or close it, and whether it is open.
export function useOpenRow(name: string) {
  const list = useContext(Open);
  const [own, setOwn] = useState(false);
  return list
    ? {
        open: list.open === name,
        toggle: () => list.toggle(name),
        close: () => list.open === name && list.toggle(name),
      }
    : { open: own, toggle: () => setOwn((o) => !o), close: () => setOwn(false) };
}

/// One property: an icon, its name, its value on the right. With `onPress` it opens, and
/// `children` (the choices) show below while `expanded`.
export function Property({
  icon,
  label,
  value,
  valueIcon,
  expanded = false,
  disabled = false,
  onPress,
  children,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
  /// Shown beside the value (a status's symbol).
  valueIcon?: ReactNode;
  expanded?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  children?: ReactNode;
}) {
  const theme = useTheme();
  const interactive = Boolean(onPress) && !disabled;
  const Chevron = !interactive
    ? null
    : children
      ? expanded
        ? IconChevronUp
        : IconChevronDown
      : IconChevronRight;
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value}`}
        accessibilityState={{ disabled: !interactive, expanded: children ? expanded : undefined }}
        disabled={!interactive}
        onPress={onPress}
        className="min-h-12 flex-row items-center gap-3 px-4 active:bg-accent/40"
      >
        {icon}
        <Text className="flex-1" numberOfLines={1}>
          {label}
        </Text>
        {valueIcon}
        <Text tone="muted" numberOfLines={1} style={{ maxWidth: "55%" }}>
          {value}
        </Text>
        {Chevron ? <Chevron size={16} color={theme.colors.mutedForeground} /> : null}
      </Pressable>
      {expanded && children ? <View className="gap-2 px-4 pb-3">{children}</View> : null}
    </View>
  );
}
