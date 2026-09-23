import { IconFeather } from "@tabler/icons-react";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { useNavStore } from "@/lib/store/nav";

/// Opens the app wide `QuickJotDialog`, the same capture surface Cmd+J and the Jots
/// list use.
export function QuickJotTrigger() {
  const setQuickJotOpen = useNavStore((s) => s.setQuickJotOpen);
  return (
    <SidebarMenuItem>
      <SidebarMenuButton tooltip="Quick Jot" onClick={() => setQuickJotOpen(true)}>
        <IconFeather />
        <span>Quick Jot</span>
        <KbdGroup className="ml-auto group-data-[collapsible=icon]:hidden">
          <Kbd>⌘</Kbd>
          <Kbd>J</Kbd>
        </KbdGroup>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
