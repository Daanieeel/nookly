import { IconFeather } from "@tabler/icons-react";
import { ShortcutKbd } from "#/components/shortcut-kbd.tsx";
import { SidebarMenuButton, SidebarMenuItem } from "@nookly/ui/components/sidebar";
import { useNavStore } from "#/lib/store/nav.ts";

/// Opens the app wide `QuickJotDialog`, the same capture surface Cmd+J and the Jots
/// list use.
export function QuickJotTrigger() {
  const setQuickJotOpen = useNavStore((s) => s.setQuickJotOpen);
  return (
    <SidebarMenuItem>
      <SidebarMenuButton size="sm" tooltip="Quick Jot" onClick={() => setQuickJotOpen(true)}>
        <IconFeather />
        <span>Quick Jot</span>
        <ShortcutKbd name="quickJot" className="ml-auto group-data-[collapsible=icon]:hidden" />
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
