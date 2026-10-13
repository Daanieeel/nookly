import type { Editor } from "@tiptap/react";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@nookly/ui/components/dialog";
import { useSetting } from "#/lib/settings/settings.ts";
import { closeVimHelp, vimState } from "./vim-extension";

const MODE_LABELS = {
  normal: "NORMAL",
  insert: "INSERT",
  visual: "VISUAL",
  "visual-line": "VISUAL LINE",
} as const;

/// The keys Vim mode understands, for the `?` overlay.
const KEY_GROUPS = [
  {
    title: "Modes",
    keys: [
      ["Esc", "Back to normal mode"],
      ["i  a  I  A", "Insert before or after the cursor, at the line start or end"],
      ["o  O", "Open a new line below or above"],
      ["v  V", "Select characters or whole lines"],
    ],
  },
  {
    title: "Move",
    keys: [
      ["h  j  k  l", "Left, down, up, right"],
      ["w  b  e", "Next word, previous word, end of word"],
      ["0  ^  $", "Line start, first word, line end"],
      ["gg  G", "First line, last line"],
      ["{  }", "Previous or next block"],
      ["3w  2j", "A count repeats a motion"],
    ],
  },
  {
    title: "Edit",
    keys: [
      ["x  X", "Delete the character under or before the cursor"],
      ["dw", "Delete a word (d with any motion)"],
      ["dd  D", "Delete the line, or to its end"],
      ["cw  cc  C", "Change a word, the line, or to its end"],
      ["diw  daw", "Delete the word under the cursor, with or without its space"],
      ["yy  yw", "Copy a line or a word"],
      ["p  P", "Paste after or before the cursor"],
      ["r", "Replace one character"],
      ["u  Ctrl+R", "Undo and redo"],
    ],
  },
] as const;

/// What mode Vim mode is in, at the corner of the page, and the key list on `?`. Nothing
/// while the `notes.vimMode` setting is off.
export function VimIndicator({ editor }: { editor: Editor | null }) {
  const [enabled] = useSetting("notes.vimMode");
  const [vim, setVim] = useState(() => (editor ? vimState(editor.state) : null));

  useEffect(() => {
    if (!editor) return;
    const update = () => setVim(vimState(editor.state));
    update();
    editor.on("transaction", update);
    return () => {
      editor.off("transaction", update);
    };
  }, [editor]);

  if (!enabled || !editor || !vim) return null;
  return (
    <>
      <p
        role="status"
        aria-label="Vim mode"
        className="pointer-events-none sticky bottom-2 mt-2 ml-auto w-fit rounded-md border border-border bg-card px-2 py-0.5 font-mono text-xs text-muted-foreground shadow-sm"
      >
        {MODE_LABELS[vim.mode]}
        {vim.operator || vim.count ? ` ${vim.count}${vim.operator}` : ""}
      </p>
      <Dialog open={vim.help} onOpenChange={(open) => !open && closeVimHelp(editor)}>
        <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vim keys</DialogTitle>
            <DialogDescription>
              The keys for pages in normal mode. Turn Vim mode off under Settings, Editor.
            </DialogDescription>
          </DialogHeader>
          {KEY_GROUPS.map((group) => (
            <section key={group.title} aria-label={group.title} className="flex flex-col gap-1">
              <h3 className="text-sm font-medium">{group.title}</h3>
              <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-xs">
                {group.keys.map(([keys, what]) => (
                  <div key={keys} className="contents">
                    <dt className="font-mono">{keys}</dt>
                    <dd className="text-muted-foreground">{what}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </DialogContent>
      </Dialog>
    </>
  );
}
