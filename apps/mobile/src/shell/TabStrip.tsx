import { IconPlus, IconX } from "@tabler/icons-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { useEntity } from "../data/queries.ts";
import { IconButton } from "../ui/Button.tsx";
import { cn } from "../ui/classes.ts";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { type Tab, titleOfPath } from "./tabs.ts";
import { useTabs } from "./tabs-store.ts";
import { useTabCommands } from "./useTabCommands.ts";

/// A page's name for its tab: the item's own title, or the page's.
export function usePathTitle(path: string): string {
  const id = /^\/entity\/([^/]+)/.exec(path)?.[1];
  const { data: entity } = useEntity(id ?? "");
  const known = titleOfPath(path);
  if (known) return known;
  return entity ? entity.title || entity.key : "Untitled";
}

function TabLabel({
  tab,
  active,
  onSelect,
  onClose,
}: {
  tab: Tab;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const title = usePathTitle(tab.path);
  return (
    <View
      className={cn(
        "h-8 max-w-56 flex-row items-center rounded-md pl-3",
        active ? "bg-accent" : "active:bg-accent/50",
      )}
    >
      <Pressable
        accessibilityRole="tab"
        accessibilityLabel={title}
        accessibilityState={{ selected: active }}
        onPress={onSelect}
        className="min-w-0 flex-shrink"
      >
        <Text numberOfLines={1} className={cn(!active && "text-muted-foreground")}>
          {title}
        </Text>
      </Pressable>
      <IconButton
        label={`Close ${title}`}
        size="iconSm"
        icon={<IconX size={14} color={theme.colors.mutedForeground} />}
        onPress={onClose}
      />
    </View>
  );
}

/// The open tabs along the top of the page, with a button for a new one.
export function TabStrip() {
  const theme = useTheme();
  const { tabs, active } = useTabs((s) => s.state);
  const commands = useTabCommands();
  return (
    <View className="h-10 flex-row items-center border-b border-border bg-background px-2">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="tablist"
        contentContainerClassName="items-center gap-1"
      >
        {tabs.map((tab) => (
          <TabLabel
            key={tab.id}
            tab={tab}
            active={tab.id === active}
            onSelect={() => commands.select(tab.id)}
            onClose={() => commands.close(tab.id)}
          />
        ))}
      </ScrollView>
      <IconButton
        label="New Tab"
        size="iconSm"
        icon={<IconPlus size={16} color={theme.colors.mutedForeground} />}
        onPress={commands.open}
      />
    </View>
  );
}
