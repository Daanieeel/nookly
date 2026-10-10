import {
  IconAlertTriangle,
  IconChevronDown,
  IconChevronRight,
  IconFileImport,
  IconPlus,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { type ClipboardEvent, type DragEvent, useState } from "react";
import { notify } from "#/components/notify.tsx";
import { StatusButtonContent, statusOf } from "#/components/action-feedback.tsx";
import { Button } from "@nookly/ui/components/button";
import { Dialog, DialogContent, DialogFooter } from "@nookly/ui/components/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";
import { ShortcutKbd } from "#/components/shortcut-kbd.tsx";
import { useRawHotkey } from "#/hooks/use-app-hotkey.ts";
import { isTyping } from "#/lib/is-typing.ts";
import { NewEntityBreadcrumb } from "#/components/new-entity-dialog.tsx";
import { EntityIcon } from "#/components/entity-icon.tsx";
import { RelatePickerPopover } from "#/features/relationships/RelatePickerPopover.tsx";
import { hiddenRelationshipTypes } from "#/features/relationships/RelationshipsPanel.tsx";
import { updateEntity, listEntities } from "#/lib/api/entities.ts";
import {
  importPageJson,
  importPageText,
  previewPageJson,
  previewPageText,
  type PagePreview,
} from "#/lib/api/notes.ts";
import { createRelationship, listRelationshipTypes } from "#/lib/api/relationships.ts";
import { listSpaces } from "#/lib/api/spaces.ts";
import type { Entity } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { qk } from "#/lib/query-keys.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { PAGE_FILE_FILTER, acceptedFormats, importFailureReason } from "./import-page.ts";
import { findDuplicate, suggestRelations } from "./import-suggestions.ts";

/// The importer refuses a file above this size; a dropped file is checked before it is read.
const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

/// Where a file's contents come from: a path the native picker gave, or the text of a
/// file that was dropped or pasted (the webview hands over contents, not a path).
type Source = { kind: "path"; path: string } | { kind: "text"; text: string };

/// The file the user picked and what importing it would create.
interface Picked {
  source: Source;
  preview: PagePreview;
}

/// A link the new page gets once it exists.
interface PlannedRelation {
  target: Entity;
  type: string;
  reverse: boolean;
  label: string;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function kindLabel(kind: string): string {
  return kind === "jot" ? "Jot" : "Note";
}

/// `heading1` as "Heading 1", `bulleted_list` as "Bulleted list".
function blockLabel(blockType: string): string {
  const spaced = blockType.replace(/_/g, " ").replace(/([a-z])(\d)/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

async function previewSource(source: Source): Promise<PagePreview> {
  return source.kind === "path" ? previewPageJson(source.path) : previewPageText(source.text);
}

/// The text of a dropped file, after the checks the backend would otherwise make later.
async function readDroppedFile(file: File): Promise<Source> {
  const allowed = PAGE_FILE_FILTER.extensions.some((e) =>
    file.name.toLowerCase().endsWith(`.${e}`),
  );
  if (!allowed) throw new Error(`Only ${acceptedFormats()} can be imported.`);
  if (file.size > MAX_IMPORT_BYTES) {
    throw new Error("This file is too large to import (the limit is 20 MB).");
  }
  return { kind: "text", text: await file.text() };
}

/// Titlebar button that opens the import dialog.
export function ImportButton() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="secondary"
          size="iconSm"
          className="ml-1 shrink-0"
          aria-label="Import"
          onClick={() => useNavStore.getState().setImportOpen(true)}
        >
          <IconFileImport size={14} />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="flex items-center gap-2">
        Import
        <ShortcutKbd name="import" />
      </TooltipContent>
    </Tooltip>
  );
}

/// Two steps: bring a file (pick, drop or paste), then read what it holds and confirm.
/// Nothing is written before the confirmation, and an import only ever adds a new item.
export function ImportDialog() {
  const open = useNavStore((s) => s.importOpen);
  const onOpenChange = useNavStore((s) => s.setImportOpen);
  // Cmd+I is italic inside a text field, so the shortcut leaves the key to the editor there.
  useRawHotkey("import", (event) => {
    if (isTyping()) return;
    event.preventDefault();
    onOpenChange(true);
  });
  const queryClient = useQueryClient();
  const activeSpaceId = useNavStore((s) => s.activeSpaceId);
  const { data: spaces = [] } = useQuery({ queryKey: qk.spaces, queryFn: listSpaces });
  const [chosenSpaceId, setChosenSpaceId] = useState<string | null>(null);
  const space = spaces.find((s) => s.id === (chosenSpaceId ?? activeSpaceId)) ?? spaces[0];
  const [picked, setPicked] = useState<Picked | null>(null);
  const [relations, setRelations] = useState<PlannedRelation[]>([]);
  const [showBlocks, setShowBlocks] = useState(false);
  const [dragging, setDragging] = useState(false);
  const { data: types = [] } = useQuery({
    queryKey: qk.relationships.types,
    queryFn: listRelationshipTypes,
  });
  const { data: entities = [] } = useQuery({
    queryKey: space ? qk.entities.bySpace(space.id) : qk.entities.all,
    queryFn: () => listEntities(space?.id ?? null, false),
    enabled: space !== undefined && picked !== null,
  });
  const kind = picked?.preview.kind ?? "note";
  const hidden = hiddenRelationshipTypes({ type: kind });
  const pickableTypes = types.filter((t) => !hidden.has(t.name));
  const suggestions = picked
    ? suggestRelations(
        picked.preview.title,
        entities,
        relations.map((r) => r.target.id),
      )
    : [];
  const duplicate = picked ? findDuplicate(kind, picked.preview.title, entities) : undefined;
  const generalType = pickableTypes.find((t) => t.name === "relates-to");

  const load = useMutation({
    mutationFn: async (read: () => Promise<Source | null>): Promise<Picked | null> => {
      const source = await read();
      return source ? { source, preview: await previewSource(source) } : null;
    },
    onSuccess: (result) => {
      if (!result) return;
      setPicked(result);
      setRelations([]);
      setShowBlocks(false);
    },
  });

  const confirm = useMutation({
    mutationFn: async (target: { spaceId: string; source: Source; asCopy: boolean }) => {
      let entity =
        target.source.kind === "path"
          ? await importPageJson(target.spaceId, target.source.path)
          : await importPageText(target.spaceId, target.source.text);
      if (target.asCopy) {
        // The page exists already; a title that cannot be changed is not worth losing it.
        entity = await updateEntity(entity.id, { title: `${entity.title} (copy)` }).catch(
          () => entity,
        );
      }
      // A link that fails is reported, never undone.
      let failed = 0;
      for (const r of relations) {
        try {
          await (r.reverse
            ? createRelationship(r.target.id, entity.id, r.type)
            : createRelationship(entity.id, r.target.id, r.type));
        } catch {
          failed += 1;
        }
      }
      return { entity, failed };
    },
    onSuccess: ({ entity, failed }) => {
      void queryClient.invalidateQueries({
        predicate: (q) => q.queryKey.includes(entity.spaceId),
      });
      void queryClient.invalidateQueries({ queryKey: qk.entities.all });
      void queryClient.invalidateQueries({ queryKey: qk.jots.unrefined });
      const message =
        failed > 0 ? `Imported, but ${plural(failed, "link")} could not be made` : "Imported";
      if (failed > 0) notify.warning(message, { entity });
      else notify.success(message, { entity });
      close();
    },
  });

  function close() {
    onOpenChange(false);
    setPicked(null);
    setChosenSpaceId(null);
    setRelations([]);
    setShowBlocks(false);
    load.reset();
    confirm.reset();
  }

  function restart() {
    setPicked(null);
    setRelations([]);
    confirm.reset();
  }

  function chooseFile() {
    load.mutate(async () => {
      const path = await openFileDialog({
        multiple: false,
        directory: false,
        filters: [PAGE_FILE_FILTER],
      });
      return path ? { kind: "path", path } : null;
    });
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) load.mutate(() => readDroppedFile(file));
  }

  function onPaste(event: ClipboardEvent) {
    if (picked) return;
    const file = event.clipboardData.files[0];
    const text = file ? "" : event.clipboardData.getData("text/plain");
    if (file) load.mutate(() => readDroppedFile(file));
    else if (text.trim().startsWith("{")) load.mutate(async () => ({ kind: "text", text }));
    else return;
    event.preventDefault();
  }

  function addRelation(target: Entity, type: string, reverse: boolean) {
    const def = types.find((t) => t.name === type);
    const label = reverse ? (def?.inverseLabel ?? type) : (def?.label ?? type);
    setRelations([...relations, { target, type, reverse, label }]);
  }

  const error = confirm.error ?? load.error;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-md gap-0 p-0" onPaste={onPaste}>
        <NewEntityBreadcrumb
          spaceId={space?.id ?? ""}
          spaceName={space?.name ?? ""}
          space={space}
          spaces={spaces}
          onSpaceChange={(id) => {
            setChosenSpaceId(id);
            // The picker lists the items of one Space, so a choice made in another goes.
            setRelations([]);
          }}
          title="Import"
          description="Import a page exported from Nookly into a space."
        />

        <div className="flex flex-col gap-3 p-4 text-sm">
          {picked ? (
            <>
              <div className="flex flex-col gap-1.5">
                <p className="font-medium">
                  {kindLabel(picked.preview.kind)} "{picked.preview.title}"
                </p>
                <div className="overflow-hidden rounded-md border border-border">
                  <button
                    type="button"
                    aria-expanded={showBlocks}
                    onClick={() => setShowBlocks(!showBlocks)}
                    className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-xs hover:bg-accent/50"
                  >
                    <span className="text-muted-foreground">Contents</span>
                    <span className="flex items-center gap-1">
                      {plural(picked.preview.blockCount, "block")}
                      {showBlocks ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                    </span>
                  </button>
                  {showBlocks && (
                    <ul className="max-h-40 divide-y divide-border overflow-y-auto border-t border-border">
                      {picked.preview.blocks.map((block, index) => (
                        <li key={index} className="flex items-center gap-2 px-2.5 py-1 text-xs">
                          <span className="w-24 shrink-0 truncate text-muted-foreground">
                            {blockLabel(block.blockType)}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {block.firstLine || "(empty)"}
                          </span>
                          {block.converted && (
                            <span className="shrink-0 text-muted-foreground">
                              becomes a paragraph
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <div>
                  <p className="font-medium">
                    Relate to <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Links the new {kindLabel(kind).toLowerCase()} to items that already exist, like
                    a course. The space is where it is stored.
                  </p>
                </div>
                {relations.map((r, index) => (
                  <div
                    key={`${r.type}:${r.reverse}:${r.target.id}`}
                    className="flex items-center gap-2 rounded-md border border-border px-2 py-1"
                  >
                    <EntityIcon entity={r.target} size={14} />
                    <span className="min-w-0 flex-1 truncate">
                      {r.label} {displayTitle(r.target)}
                    </span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="iconSm"
                          aria-label="Remove relation"
                          onClick={() => setRelations(relations.filter((_, i) => i !== index))}
                        >
                          <IconX size={14} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Remove relation</TooltipContent>
                    </Tooltip>
                  </div>
                ))}
                {generalType && suggestions.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-xs text-muted-foreground">Suggested</span>
                    {suggestions.map((s) => (
                      <Button
                        key={s.id}
                        variant="secondary"
                        size="sm"
                        className="h-6 gap-1 px-2 text-xs font-normal"
                        onClick={() => addRelation(s, generalType.name, false)}
                      >
                        <EntityIcon entity={s} size={12} />
                        {displayTitle(s)}
                      </Button>
                    ))}
                  </div>
                )}
                {space && (
                  <RelatePickerPopover
                    key={space.id}
                    spaceId={space.id}
                    exclude=""
                    entityType={kind}
                    types={pickableTypes}
                    trigger={
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-full justify-start gap-1.5 px-2 font-normal [&_svg]:size-3.5"
                      >
                        <IconPlus size={14} />
                        Relate to...
                      </Button>
                    }
                    onSelect={addRelation}
                  />
                )}
              </div>
              {duplicate && (
                <div
                  role="status"
                  className="flex flex-col gap-2 rounded-md border border-border bg-accent/40 p-3 text-xs"
                >
                  <div className="flex flex-col gap-1.5">
                    <span className="flex items-center gap-1.5 font-medium">
                      <IconAlertTriangle size={14} className="shrink-0 text-muted-foreground" />
                      Already in this space
                    </span>
                    <span
                      title={duplicate.title}
                      className="flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1"
                    >
                      <EntityIcon entity={duplicate} size={14} />
                      <span className="min-w-0 flex-1 truncate">{duplicate.title}</span>
                    </span>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={confirm.isPending}
                      onClick={restart}
                    >
                      Skip
                    </Button>
                    <Button
                      size="sm"
                      disabled={confirm.isPending || confirm.isSuccess}
                      onClick={() =>
                        confirm.mutate({
                          spaceId: space?.id ?? "",
                          source: picked.source,
                          asCopy: true,
                        })
                      }
                    >
                      <StatusButtonContent
                        status={statusOf(confirm)}
                        label="Import as copy"
                        successLabel="Imported"
                        errorLabel="Try Again"
                      />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div
              data-testid="import-drop-zone"
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                "flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-8 text-center",
                dragging && "border-primary bg-accent/40",
              )}
            >
              <IconUpload size={20} className="text-muted-foreground" />
              <p>Drop a file here, or paste one</p>
              <Button variant="secondary" size="sm" disabled={load.isPending} onClick={chooseFile}>
                Choose File
              </Button>
              <p className="text-xs text-muted-foreground">{acceptedFormats()}</p>
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {importFailureReason(error)}
            </p>
          )}
        </div>

        {picked && space && !duplicate && (
          <DialogFooter className="px-4 pb-4">
            <Button variant="secondary" disabled={confirm.isPending} onClick={restart}>
              Choose Another
            </Button>
            <Button
              disabled={confirm.isPending || confirm.isSuccess}
              onClick={() =>
                confirm.mutate({ spaceId: space.id, source: picked.source, asCopy: false })
              }
            >
              <StatusButtonContent
                status={statusOf(confirm)}
                label={`Import ${kindLabel(kind)}`}
                successLabel="Imported"
                errorLabel="Try Again"
              />
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
