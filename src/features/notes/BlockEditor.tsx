import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import { Selection } from "@tiptap/pm/state";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { listEntities } from "@/lib/api/entities";
import { createBlock, deleteBlock, reorderBlocks, updateBlock } from "@/lib/api/notes";
import type { Block } from "@/lib/api/types";
import { useNavStore } from "@/lib/store/nav";
import { cn } from "@/lib/utils";
import { type BlockInput, blockToNode, type JSONNode, nodeToBlockInput } from "./block-markdown";
import { BlockHandles } from "./BlockHandles";
import { CodeBlockWithHeader } from "./code-block-extension";
import { Mention } from "./mention-extension";
import { SlashCommand } from "./slash-command-extension";
import { TableControls } from "./TableControls";
import { TableRowHandles } from "./TableRowHandles";
import { blocksQueryOptions, saveBlocksKey } from "./blocks-query";
import { UniqueBlockId } from "./unique-block-id";

const DEBOUNCE_MS = 600;
const MENTION_HREF_PREFIX = "mention:";

/// One continuous document, not N glued textareas (§ notes rewrite) — a single
/// Tiptap/ProseMirror editor owns the whole page, exactly like Notion. Each
/// top-level node still round-trips to one row in the existing per-block backend
/// (`block-markdown.ts`); this component's only extra job is reconciling the two.
export function BlockEditor({
  entityId,
  spaceId,
  compact = false,
}: {
  entityId: string;
  spaceId: string;
  /// Starts at a single empty line and grows with content, instead of the
  /// full-page canvas's `min-h-40` — for a Notes surface embedded inline
  /// inside another entity's page (e.g. Course Notes) rather than owning
  /// the whole view.
  compact?: boolean;
}) {
  const { data: blocks } = useQuery(blocksQueryOptions(entityId));
  // A save still landing from the last time this page was open (flushed on
  // unmount) means the cached blocks are about to be replaced; hydrating now
  // would load the stale copy. Only gates the first hydration, never an open
  // editor's own saves.
  const saving = useIsMutating({ mutationKey: saveBlocksKey(entityId) }) > 0;
  const hydratedIdRef = useRef<string | null>(null);
  // The editor is only created once blocks are in, with them as its initial
  // content: one render pass, and no `setContent` afterwards (which would emit
  // an update and schedule a pointless save). Later refetches are ignored; the
  // editor is the source of truth from then on.
  if (!blocks || (saving && hydratedIdRef.current !== entityId)) {
    return <div className={cn(!compact && "min-h-40")} />;
  }
  hydratedIdRef.current = entityId;
  return (
    <HydratedBlockEditor
      key={entityId}
      entityId={entityId}
      spaceId={spaceId}
      compact={compact}
      initialBlocks={blocks}
    />
  );
}

function HydratedBlockEditor({
  entityId,
  spaceId,
  compact,
  initialBlocks,
}: {
  entityId: string;
  spaceId: string;
  compact: boolean;
  initialBlocks: Block[];
}) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const { data: entities = [] } = useQuery({
    queryKey: ["entities", spaceId],
    queryFn: () => listEntities(spaceId, false),
  });

  const entitiesRef = useRef(entities);
  entitiesRef.current = entities;

  /// Client-generated `blockId` (assigned by `UniqueBlockId`) -> server block id.
  /// Pre-existing blocks bootstrap this as an identity mapping (§ notes rewrite).
  const [idMap] = useState(
    () => new Map<string, string>(initialBlocks.map((block) => [block.id, block.id])),
  );
  const [persisted] = useState(
    () =>
      new Map<string, { content: string; blockType: string; language?: string; filename?: string }>(
        initialBlocks.map((block) => [
          block.id,
          {
            content: block.content,
            blockType: block.blockType,
            language: block.language ?? undefined,
            filename: block.filename ?? undefined,
          },
        ]),
      ),
  );
  /// Server block ids in the order last persisted, so a save that only edits
  /// text skips the `reorderBlocks` round trip.
  const orderRef = useRef(initialBlocks.map((block) => block.id));
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNodesRef = useRef<JSONNode[] | null>(null);
  // One toast per failure streak, not one per retry.
  const saveFailingRef = useRef(false);

  // `refetchType: "all"` also refreshes the cache after a save flushed on
  // unmount, when no editor is observing the query anymore.
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["blocks", entityId], refetchType: "all" });

  const reconcile = useMutation({
    mutationKey: saveBlocksKey(entityId),
    mutationFn: async (nodes: JSONNode[]) => {
      const inputs = nodes.map(nodeToBlockInput).filter((b): b is BlockInput => b !== null);
      const previous = persisted;
      const currentIds = new Set(inputs.map((i) => i.blockId));

      for (const clientId of [...previous.keys()]) {
        if (currentIds.has(clientId)) continue;
        const serverId = idMap.get(clientId);
        if (serverId) await deleteBlock(serverId);
        idMap.delete(clientId);
        previous.delete(clientId);
      }

      for (const input of inputs) {
        const prior = previous.get(input.blockId);
        const meta = { content: input.content, blockType: input.blockType };
        if (!prior) {
          const created = await createBlock(
            entityId,
            input.blockType,
            input.content,
            null,
            input.language ?? null,
            input.filename ?? null,
          );
          idMap.set(input.blockId, created.id);
          previous.set(input.blockId, {
            ...meta,
            language: input.language,
            filename: input.filename,
          });
        } else if (
          prior.content !== input.content ||
          prior.blockType !== input.blockType ||
          prior.language !== input.language ||
          prior.filename !== input.filename
        ) {
          const serverId = idMap.get(input.blockId);
          if (serverId) {
            await updateBlock(serverId, {
              content: input.content,
              blockType: input.blockType,
              // Header edits on a `code` block only — `""` clears the field.
              ...(input.blockType === "code" && {
                language: input.language ?? "",
                filename: input.filename ?? "",
              }),
            });
          }
          previous.set(input.blockId, {
            ...meta,
            language: input.language,
            filename: input.filename,
          });
        }
      }

      const orderedServerIds = inputs
        .map((i) => idMap.get(i.blockId))
        .filter((id): id is string => Boolean(id));
      const order = orderRef.current;
      const unchanged =
        orderedServerIds.length === order.length &&
        orderedServerIds.every((id, index) => id === order[index]);
      if (orderedServerIds.length > 0 && !unchanged) {
        await reorderBlocks(entityId, orderedServerIds);
        orderRef.current = orderedServerIds;
      }
    },
    onSuccess: () => {
      saveFailingRef.current = false;
    },
    // Autosave has no control to carry the error, so a toast is the fallback here.
    onError: () => {
      if (saveFailingRef.current) return;
      saveFailingRef.current = true;
      toast.error("Couldn't save changes", {
        description: "They'll be saved again on your next edit.",
      });
    },
    // Returning the refetch keeps the mutation pending until the cache is
    // fresh, which is what `BlockEditor`'s hydration gate waits on.
    onSettled: () => {
      const pending = pendingNodesRef.current;
      pendingNodesRef.current = null;
      if (pending) runReconcile(pending);
      else return invalidate();
    },
  });

  function runReconcile(nodes: JSONNode[]) {
    if (reconcile.isPending) {
      pendingNodesRef.current = nodes;
      return;
    }
    reconcile.mutate(nodes);
  }

  const editor = useEditor({
    content: {
      type: "doc",
      content: initialBlocks.length > 0 ? initialBlocks.map(blockToNode) : [{ type: "paragraph" }],
    },
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: false,
          protocols: [{ scheme: "mention", optionalSlashes: true }],
        },
        // Replaced by a dedicated `CodeBlockLowlight` extension below for syntax highlighting.
        codeBlock: false,
      }),
      CodeBlockWithHeader.configure({ defaultLanguage: "plaintext" }),
      Placeholder.configure({ placeholder: "Type “/” for commands, or just start writing…" }),
      TableKit.configure({ table: { resizable: true } }),
      UniqueBlockId,
      SlashCommand,
      Mention.configure({ getEntities: () => entitiesRef.current }),
    ],
    editorProps: {
      attributes: {
        class: cn("tiptap-content text-sm/relaxed", !compact && "min-h-40"),
      },
      handleClickOn: (_view, _pos, _node, _nodePos, event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement) || target.tagName !== "A") return false;
        const href = target.getAttribute("href");
        if (href?.startsWith(MENTION_HREF_PREFIX)) {
          event.preventDefault();
          openEntity(href.slice(MENTION_HREF_PREFIX.length), spaceId);
          return true;
        }
        return false;
      },
    },
    onUpdate: () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => flushRef.current(), DEBOUNCE_MS);
    },
  });

  // Scrolls to a block requested from outside (a block level search result)
  // once the page has hydrated, then hands the request back.
  const focusBlock = useNavStore((s) => s.focusBlock);
  const clearFocusBlock = useNavStore((s) => s.clearFocusBlock);
  useEffect(() => {
    if (!editor || focusBlock?.entityId !== entityId) return;
    // Blocks created earlier in this editor session still carry their client
    // id, so map the server id back first.
    const clientId =
      [...idMap].find(([, serverId]) => serverId === focusBlock.blockId)?.[0] ?? focusBlock.blockId;
    let frame = 0;
    let settle: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;

    /// Found through the document rather than a `[data-block-id]` query: node
    /// view blocks (code blocks, tables) don't carry node attrs onto their DOM.
    function locate(): { element: HTMLElement; pos: number } | null {
      if (!editor) return null;
      let found: { element: HTMLElement; pos: number } | null = null;
      editor.state.doc.forEach((node, pos) => {
        if (found || node.attrs.blockId !== clientId) return;
        const dom = editor.view.nodeDOM(pos);
        if (dom instanceof HTMLElement && dom.isConnected) found = { element: dom, pos };
      });
      return found;
    }

    function attempt() {
      if (!editor) return;
      const target = locate();
      if (!target) {
        // The node may not be rendered yet; give up after about half a second.
        if (tries++ < 30) frame = requestAnimationFrame(attempt);
        else clearFocusBlock();
        return;
      }
      const { element, pos } = target;
      element.scrollIntoView({ block: "center" });
      element.animate(
        [
          { backgroundColor: "color-mix(in oklab, var(--primary) 16%, transparent)" },
          { backgroundColor: "transparent" },
        ],
        { duration: 1800, easing: "ease-out" },
      );
      // Re-center once late layout (syntax highlighting, images) has settled,
      // and only place the cursor after the closing overlay released focus.
      settle = setTimeout(() => {
        clearFocusBlock();
        if (!element.isConnected) return;
        element.scrollIntoView({ block: "center" });
        // `Selection.near` finds the first text position inside the block, which
        // for a table is its first cell rather than the table node itself.
        const { state } = editor.view;
        const start = Math.min(pos + 1, state.doc.content.size);
        editor.view.dispatch(state.tr.setSelection(Selection.near(state.doc.resolve(start))));
        editor.commands.focus(null, { scrollIntoView: false });
      }, 300);
    }

    frame = requestAnimationFrame(attempt);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settle);
    };
  }, [editor, focusBlock, entityId, clearFocusBlock]);

  /// Saves the current document now, cancelling any pending debounce. Kept in a
  /// ref so the unmount cleanup below calls this render's version, not the first.
  const flushRef = useRef(() => {});
  flushRef.current = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = null;
    if (!editor) return;
    const doc = editor.getJSON();
    // SAFETY: `getJSON()`'s recursive `{type, attrs, content, text, marks}` shape
    // structurally satisfies the `JSONNode` subset this module actually reads.
    runReconcile((doc.content ?? []) as JSONNode[]);
  };

  // Leaving the page inside the debounce window saves right away instead of
  // dropping the last edits. `useEditor` destroys its editor on a later tick, so
  // the document is still readable here.
  useEffect(
    () => () => {
      if (debounceRef.current) flushRef.current();
    },
    [],
  );

  return (
    <div className="relative">
      <TableControls editor={editor} />
      <TableRowHandles editor={editor} />
      <BlockHandles editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
