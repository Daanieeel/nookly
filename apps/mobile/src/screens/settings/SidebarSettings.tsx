import { IconChevronDown, IconChevronUp } from "@tabler/icons-react-native";
import { Switch, View } from "react-native";
import { usePreference } from "../../data/preferences.ts";
import { IconButton } from "../../ui/Button.tsx";
import { ROW_DIVIDER, Section } from "../../ui/Row.tsx";
import { Screen } from "../../ui/Screen.tsx";
import { Text } from "../../ui/Text.tsx";
import { cn } from "../../ui/classes.ts";
import { useTheme } from "../../ui/theme.ts";
import { DEFAULT_TOP, orderedTop, topSchema } from "../sidebar-top.ts";

/// Which overviews the sidebar lists at the top, and in what order. Kept on this phone,
/// like the desktop's.
export function SidebarSettingsScreen() {
  const theme = useTheme();
  const [pref, setPref] = usePreference("sidebar.top", topSchema, DEFAULT_TOP);
  const items = orderedTop(pref);
  const ids = items.map((i) => i.id);
  const move = (from: number, to: number) => {
    const next = [...ids];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setPref({ ...pref, order: next });
  };
  const show = (id: string, on: boolean) =>
    setPref({
      order: ids,
      hidden: on ? pref.hidden.filter((h) => h !== id) : [...pref.hidden, id],
    });
  return (
    <Screen>
      <Text tone="muted">Choose what the sidebar lists first, and in what order.</Text>
      <Section>
        {items.map((item, index) => (
          <View key={item.id} className={cn("flex-row items-center gap-1 px-4 py-1", ROW_DIVIDER)}>
            <Text className="flex-1">{item.label}</Text>
            <IconButton
              label={`Move ${item.label} Up`}
              icon={<IconChevronUp size={18} color={theme.colors.foreground} />}
              onPress={() => index > 0 && move(index, index - 1)}
            />
            <IconButton
              label={`Move ${item.label} Down`}
              icon={<IconChevronDown size={18} color={theme.colors.foreground} />}
              onPress={() => index < items.length - 1 && move(index, index + 1)}
            />
            <Switch
              accessibilityLabel={`Show ${item.label}`}
              value={!pref.hidden.includes(item.id)}
              onValueChange={(on) => show(item.id, on)}
            />
          </View>
        ))}
      </Section>
    </Screen>
  );
}
