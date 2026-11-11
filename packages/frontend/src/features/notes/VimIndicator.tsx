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
import { VIM_KEY_GROUPS, VIM_MODE_LABELS } from "@nookly/shared/vim";
import { closeVimHelp, vimState } from "./vim-extension";

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
        {VIM_MODE_LABELS[vim.mode]}
        {vim.operator || vim.count ? ` ${vim.count}${vim.operator}` : ""}
      </p>
      <Dialog open={vim.help} onOpenChange={(open) => !open && closeVimHelp(editor.view)}>
        <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vim keys</DialogTitle>
            <DialogDescription>
              The keys for pages in normal mode. Turn Vim mode off under Settings, Editor.
            </DialogDescription>
          </DialogHeader>
          {VIM_KEY_GROUPS.map((group) => (
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
