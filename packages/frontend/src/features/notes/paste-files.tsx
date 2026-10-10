import { useQueryClient } from "@tanstack/react-query";
import type { EditorView } from "@tiptap/pm/view";
import { type CSSProperties, useRef, useState } from "react";
import { notify } from "#/components/notify.tsx";
import { Button } from "@nookly/ui/components/button";
import { Input } from "@nookly/ui/components/input";
import { Popover, PopoverAnchor, PopoverContent } from "@nookly/ui/components/popover";
import { updateEntity } from "#/lib/api/entities.ts";
import { importFileFromBytes } from "#/lib/api/files.ts";
import { attachLabel, createLabel, listLabels } from "#/lib/api/labels.ts";
import { labelColorFor } from "#/components/label-manager.tsx";
import { qk } from "#/lib/query-keys.ts";
import { refreshAfterFileRename } from "#/lib/rename-sync.ts";
import { inheritPageContext } from "#/features/relationships/inherit-context.ts";
import { mentionMarkdown } from "#/features/relationships/mention-utils.ts";
import type { MediaKind } from "./MediaBlock";

/// A freshly pasted File waiting for its optional rename.
interface Naming {
  entityId: string;
  filename: string;
  /// Viewport position of the caret the file was pasted at.
  x: number;
  y: number;
}

const PASTED_LABEL = "Pasted";

/// Puts the Space's "Pasted" label on a File, creating the label the first time.
async function labelPasted(spaceId: string, entityId: string) {
  const labels = await listLabels(spaceId);
  const existing = labels.find((l) => l.name.toLowerCase() === PASTED_LABEL.toLowerCase());
  const label = existing ?? (await createLabel(spaceId, PASTED_LABEL, labelColorFor(PASTED_LABEL)));
  await attachLabel(entityId, label.id);
}

function kindOf(mime: string): MediaKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

function nameOf(file: File, kind: MediaKind): string {
  if (file.name) return file.name;
  const ext = file.type.split("/")[1]?.split("+")[0];
  return ext ? `${kind}.${ext}` : kind;
}

/// Pasting files into the editor stores each as a File in the page's Space, embeds it
/// as the matching media block, then offers a popover to rename it.
export function usePasteFiles(spaceId: string, pageId: string) {
  const queryClient = useQueryClient();
  const [queue, setQueue] = useState<Naming[]>([]);
  const [name, setName] = useState("");
  const saving = useRef(false);

  const refresh = (entityId: string) => {
    void queryClient.invalidateQueries({ queryKey: qk.files.bySpace(spaceId) });
    void queryClient.invalidateQueries({ queryKey: qk.entities.bySpace(spaceId) });
    void queryClient.invalidateQueries({ queryKey: qk.entity.byId(entityId) });
  };

  async function embed(view: EditorView, file: File, at: { x: number; y: number }) {
    const kind = kindOf(file.type);
    const filename = nameOf(file, kind);
    try {
      const stored = await importFileFromBytes(
        spaceId,
        filename,
        new Uint8Array(await file.arrayBuffer()),
      );
      // A label that fails to apply must not lose the pasted file.
      await labelPasted(spaceId, stored.entity.id).catch(() => {
        notify.error(`Couldn't label ${filename} as ${PASTED_LABEL}`, {
          description: "Add the label by hand.",
        });
      });
      void queryClient.invalidateQueries({ queryKey: qk.labels.bySpace(spaceId) });
      // Same for the page's context: the file stays imported if attaching fails.
      await inheritPageContext(queryClient, pageId, stored.entity.id).catch(() => {
        notify.error(`Couldn't attach ${filename} to this page`, {
          description: "Relate it to the page by hand.",
        });
      });
      const node = view.state.schema.nodes[kind]?.create({
        rows: mentionMarkdown(filename, stored.entity.id),
      });
      if (!node || view.isDestroyed) return;
      view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView());
      refresh(stored.entity.id);
      setQueue((q) => {
        if (q.length === 0) setName(filename);
        return [...q, { entityId: stored.entity.id, filename, ...at }];
      });
    } catch {
      notify.error(`Couldn't paste ${filename}`, { description: "Try pasting it again." });
    }
  }

  /// `handlePaste` for the editor: claims the paste only when it carries files and no
  /// text (copying from a spreadsheet or Word also puts a picture on the clipboard).
  const handlePaste = (view: EditorView, event: ClipboardEvent): boolean => {
    const data = event.clipboardData;
    const files = data ? [...data.files] : [];
    if (files.length === 0 || data?.getData("text/plain")) return false;
    const caret = view.coordsAtPos(view.state.selection.from);
    const at = { x: caret.left, y: caret.bottom };
    void (async () => {
      for (const file of files) await embed(view, file, at);
    })();
    return true;
  };

  const current = queue[0];
  const close = () => {
    const [next] = queue.slice(1);
    setQueue((q) => q.slice(1));
    setName(next?.filename ?? "");
  };
  const save = async () => {
    const title = name.trim();
    if (!current || saving.current) return;
    if (title && title !== current.filename) {
      saving.current = true;
      try {
        await updateEntity(current.entityId, { title });
        refresh(current.entityId);
        void refreshAfterFileRename(queryClient);
      } catch {
        notify.error("Couldn't rename the file", { description: "Rename it from its own page." });
      } finally {
        saving.current = false;
      }
    }
    close();
  };

  const popover = (
    <Popover open={current !== undefined} onOpenChange={(open) => !open && close()}>
      <PopoverAnchor asChild>
        <span
          aria-hidden
          className="pointer-events-none fixed top-(--paste-y) left-(--paste-x) size-0"
          // SAFETY: only custom properties, which `CSSProperties` can't name.
          style={
            {
              "--paste-x": `${current?.x ?? 0}px`,
              "--paste-y": `${current?.y ?? 0}px`,
            } as CSSProperties
          }
        />
      </PopoverAnchor>
      <PopoverContent className="w-72 p-2">
        <form
          className="flex items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Input
            // oxlint-disable-next-line jsx-a11y/no-autofocus -- the dialog opens on an explicit paste, so focus belongs in the field
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onFocus={(event) => event.target.select()}
            placeholder="File name"
            aria-label="File name"
            className="h-7 min-w-0 flex-1 text-xs"
          />
          <Button type="submit" variant="secondary" size="sm" className="h-7">
            Save
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );

  return { handlePaste, popover };
}
