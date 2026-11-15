import { IconPlus, IconX } from "@tabler/icons-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { useEntity } from "../data/queries.ts";
import { IconButton } from "../ui/Button.tsx";
import { cn } from "../ui/classes.ts";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { CONTROL_SIZE, touchSlop } from "../ui/touch.ts";
import { titleKey, usePageTitles } from "./PageHost.tsx";
import { titleOfPath } from "./titles.ts";
import type { PageTab } from "./workspace.ts";
import { useWorkspace, workspace } from "./workspace-store.ts";

/// A page's name for its tab: the item's own title, what the page called itself, or the
/// page's name.
export function usePathTitle(path: string, tabId?: string): string {
  const id = /^\/entity\/([^/?]+)/.exec(path)?.[1];
  const { data: entity } = useEntity(id ?? "");
  const own = usePageTitles((s) => (tabId ? s.titles[titleKey(tabId, path)] : undefined));
  if (entity) return entity.title || entity.key;
  return own ?? titleOfPath(path) ?? "Untitled";
}

function TabLabel({ tab, active, preview }: { tab: PageTab; active: boolean; preview: boolean }) {
  const theme = useTheme();
  const title = usePathTitle(tab.view, tab.id);
  return (
    <View
      className={cn(
        "h-9 max-w-56 flex-row items-center rounded-md pl-3",
        active ? "bg-accent" : "active:bg-accent/50",
      )}
    >
      <Pressable
        accessibilityRole="tab"
        accessibilityLabel={title}
        accessibilityState={{ selected: active }}
        onPress={() => workspace.select(tab.id)}
        hitSlop={{ top: touchSlop(CONTROL_SIZE.sm).top, bottom: touchSlop(CONTROL_SIZE.sm).bottom }}
        className="min-w-0 flex-shrink active:opacity-60"
      >
        <Text
          numberOfLines={1}
          className={cn(!active && "text-muted-foreground", preview && "italic")}
        >
          {title}
        </Text>
      </Pressable>
      <IconButton
        label={`Close ${title}`}
        size="iconSm"
        icon={<IconX size={14} color={theme.colors.mutedForeground} />}
        onPress={() => workspace.close(tab.id)}
      />
    </View>
  );
}

/// A group's open tabs, with a button for a new one: the desktop's tab bar.
export function TabStrip({ groupId }: { groupId: string }) {
  const theme = useTheme();
  const group = useWorkspace((s) => s.ws.layout.groups.find((g) => g.id === groupId));
  const preview = useWorkspace((s) => s.ws.preview[groupId]);
  if (!group) return null;
  return (
    <View className="h-11 flex-row items-center px-1">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="tablist"
        contentContainerClassName="items-center gap-1"
      >
        {group.tabs.map((tab) => (
          <TabLabel
            key={tab.id}
            tab={tab}
            active={tab.id === group.activeTabId}
            preview={tab.id === preview}
          />
        ))}
      </ScrollView>
      <IconButton
        label="New Tab"
        size="iconSm"
        icon={<IconPlus size={16} color={theme.colors.mutedForeground} />}
        onPress={() => {
          workspace.focus(groupId);
          workspace.open("/", "newTab");
        }}
      />
    </View>
  );
}
