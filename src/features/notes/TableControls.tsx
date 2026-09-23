import {
  IconColumnInsertRight,
  IconColumnRemove,
  IconRowInsertBottom,
  IconRowRemove,
  IconTableOff,
  IconTableRow,
} from "@tabler/icons-react";
import type { Editor } from "@tiptap/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface TableRect {
  top: number;
  left: number;
}

/// Small floating toolbar for the table the caret is currently inside (§ table
/// block) — Tiptap's table extension only exposes commands, no UI of its own.
/// Positioned by measuring the table's own DOM node rather than a bubble-menu
/// library, since it only ever needs to track one anchor (top-left of the
/// table) rather than an arbitrary selection range.
export function TableControls({ editor }: { editor: Editor | null }) {
  const [rect, setRect] = useState<TableRect | null>(null);

  useEffect(() => {
    if (!editor) return;

    const update = () => {
      const { $from } = editor.state.selection;
      for (let depth = $from.depth; depth >= 0; depth--) {
        if ($from.node(depth).type.name !== "table") continue;
        const dom = editor.view.nodeDOM($from.before(depth));
        const tableEl = dom instanceof HTMLElement ? dom.querySelector("table") : null;
        if (tableEl) {
          const tableBox = tableEl.getBoundingClientRect();
          const editorBox = editor.view.dom.getBoundingClientRect();
          setRect({ top: tableBox.top - editorBox.top, left: tableBox.left - editorBox.left });
        }
        return;
      }
      setRect(null);
    };

    update();
    editor.on("selectionUpdate", update);
    editor.on("transaction", update);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
    };
  }, [editor]);

  if (!editor || !rect) return null;

  type TableButton = {
    icon: typeof IconRowInsertBottom;
    label: string;
    onClick: () => void;
    iconClassName: string;
  };

  const groups: TableButton[][] = [
    [
      {
        icon: IconRowInsertBottom,
        label: "Add row",
        onClick: () => editor.chain().focus().addRowAfter().run(),
        iconClassName: "text-positive",
      },
      {
        icon: IconColumnInsertRight,
        label: "Add column",
        onClick: () => editor.chain().focus().addColumnAfter().run(),
        iconClassName: "text-positive",
      },
    ],
    [
      {
        icon: IconTableRow,
        label: "Toggle header row",
        onClick: () => editor.chain().focus().toggleHeaderRow().run(),
        iconClassName: "text-muted-foreground",
      },
    ],
    [
      {
        icon: IconRowRemove,
        label: "Delete row",
        onClick: () => editor.chain().focus().deleteRow().run(),
        iconClassName: "text-destructive",
      },
      {
        icon: IconColumnRemove,
        label: "Delete column",
        onClick: () => editor.chain().focus().deleteColumn().run(),
        iconClassName: "text-destructive",
      },
      {
        icon: IconTableOff,
        label: "Delete table",
        onClick: () => editor.chain().focus().deleteTable().run(),
        iconClassName: "text-destructive",
      },
    ],
  ];

  return (
    <div
      className="absolute z-10 flex -translate-y-full items-center gap-3 rounded-md border border-border bg-popover p-0.5 shadow-sm"
      style={{ top: rect.top, left: rect.left }}
    >
      {groups.map((group, i) => (
        <div key={i} className="flex items-center gap-0.5">
          {group.map(({ icon: Icon, label, onClick, iconClassName }) => (
            <Tooltip key={label}>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="size-6" onClick={onClick}>
                  <Icon size={14} className={iconClassName} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      ))}
    </div>
  );
}
