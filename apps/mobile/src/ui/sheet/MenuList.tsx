import { IconCheck, IconChevronRight } from "@tabler/icons-react-native";
import { type ComponentType, Fragment, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { cn } from "../classes.ts";
import { Text } from "../Text.tsx";
import { useTheme } from "../theme.ts";
import { TOUCH_ROW } from "../touch.ts";
import { useSheet } from "./Sheet.tsx";

/// A Tabler icon, drawn in the item's color.
export type MenuIcon = ComponentType<{ size?: number; color?: string }>;

/// One action of a menu, as the desktop's `DropdownMenuItem`: an icon and a label. An item
/// with `submenu` or `page` opens its own step in the sheet (Move to Space, Labels) instead
/// of acting.
export interface MenuItem {
  label: string;
  icon?: MenuIcon;
  destructive?: boolean;
  disabled?: boolean;
  /// Shown with a check (a label that is on).
  checked?: boolean;
  onPress?: () => void;
  submenu?: () => MenuEntry[];
  /// A step of its own content: a picker, a search.
  page?: () => ReactNode;
}

/// A line between groups, the desktop's `DropdownMenuSeparator`.
export const SEPARATOR = "separator";
export type MenuEntry = MenuItem | typeof SEPARATOR;

/// The groups of a menu, with the destructive items taken out of theirs and put last, as
/// the desktop always does.
export function menuGroups(entries: MenuEntry[]): MenuItem[][] {
  const groups: MenuItem[][] = [[]];
  const destructive: MenuItem[] = [];
  for (const entry of entries) {
    if (entry === SEPARATOR) groups.push([]);
    else if (entry.destructive) destructive.push(entry);
    else groups[groups.length - 1].push(entry);
  }
  return [...groups, destructive].filter((group) => group.length > 0);
}

/// A menu's items in a sheet: rows the height of a finger, the desktop's icon, label and
/// separators, destructive ones in red at the bottom.
export function MenuList({ entries }: { entries: MenuEntry[] }) {
  const sheet = useSheet();
  const theme = useTheme();
  return (
    <View accessibilityRole="menu" className="-mx-2">
      {menuGroups(entries).map((group, index) => (
        <Fragment key={group.map((item) => item.label).join("|")}>
          {index > 0 ? <View className="mx-1 my-1 h-px bg-border" /> : null}
          {group.map((item) => {
            const color = item.destructive
              ? theme.colors.destructive
              : theme.colors.mutedForeground;
            const Icon = item.icon;
            return (
              <Pressable
                key={item.label}
                accessibilityRole="menuitem"
                accessibilityLabel={item.label}
                accessibilityState={{ disabled: !!item.disabled, checked: item.checked }}
                disabled={item.disabled}
                style={TOUCH_ROW}
                onPress={() => {
                  const step =
                    item.page?.() ?? (item.submenu ? <MenuList entries={item.submenu()} /> : null);
                  if (step && sheet) {
                    sheet.push({ title: item.label, content: step });
                    return;
                  }
                  const act = item.onPress;
                  if (sheet) sheet.close(act);
                  else act?.();
                }}
                className={cn(
                  "flex-row items-center gap-3 rounded-md px-3 active:bg-accent",
                  item.destructive && "active:bg-destructive/10",
                  item.disabled && "opacity-50",
                )}
              >
                {Icon ? <Icon size={16} color={color} /> : null}
                <Text
                  numberOfLines={1}
                  tone={item.destructive ? "destructive" : "default"}
                  className="flex-1"
                >
                  {item.label}
                </Text>
                {item.checked ? <IconCheck size={16} color={theme.colors.primary} /> : null}
                {item.submenu || item.page ? (
                  <IconChevronRight size={16} color={theme.colors.mutedForeground} />
                ) : null}
              </Pressable>
            );
          })}
        </Fragment>
      ))}
    </View>
  );
}
