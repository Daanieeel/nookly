import {
  IconColumnInsertLeft,
  IconColumnInsertRight,
  IconLayoutColumns,
} from "@tabler/icons-react";
import { useState } from "react";
import { Button } from "@nookly/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { ShortcutKbd } from "#/components/shortcut-kbd.tsx";
import { tabGroups, useNavStore } from "#/lib/store/nav.ts";
import { canSplitLeft, canSplitRight } from "#/lib/store/tab-groups.ts";

/// Titlebar button that opens the current tab again beside the focused group.
export function SplitButton() {
  const [open, setOpen] = useState(false);
  const nav = useNavStore();
  const layout = { groups: tabGroups(nav), focusedGroupId: nav.focusedGroupId };
  const tabId = nav.activeTabId;

  function split(side: "left" | "right") {
    const nav = useNavStore.getState();
    if (side === "left") nav.splitLeft();
    else nav.splitRight();
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="secondary" size="iconSm" className="ml-1 shrink-0" aria-label="Split">
              <IconLayoutColumns size={14} />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Split</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" aria-label="Split" className="w-56 p-1">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2"
          disabled={!canSplitLeft(layout, tabId)}
          onClick={() => split("left")}
        >
          <IconColumnInsertLeft size={14} />
          <span className="flex-1 text-left">Split Left</span>
          <ShortcutKbd name="splitLeft" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2"
          disabled={!canSplitRight(layout, tabId)}
          onClick={() => split("right")}
        >
          <IconColumnInsertRight size={14} />
          <span className="flex-1 text-left">Split Right</span>
          <ShortcutKbd name="splitRight" />
        </Button>
      </PopoverContent>
    </Popover>
  );
}
