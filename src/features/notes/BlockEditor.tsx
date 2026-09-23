import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import { Selection, TextSelection } from "@tiptap/pm/state";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { contextTargetAt, makeTarget } from "@/components/context-menu/registry";
import { listEntities } from "@/lib/api/entities";
import { createBlock, deleteBlock, reorderBlocks, updateBlock } from "@/lib/api/notes";
import type { Block } from "@/lib/api/types";
import { useNavStore } from "@/lib/store/nav";
import { cn } from "@/lib/utils";
import {
  asString,
  attrsKey,
  type BlockInput,
  blockToNode,
  type JSONNode,
  nodeToBlockInput,
} from "./block-markdown";
import { BlockHandles, findTopLevelBlock, GUTTER_WIDTH, topLevelElement } from "./BlockHandles";
import { BlockSelection } from "./block-selection";
import { CodeBlockWithHeader } from "./code-block-extension";
import {
  Callout,
  Details,
  Divider,
  Progress,
  Stats,
  Steps,
  Timeline,
  Tree,
} from "./custom-block-extensions";
import { Mention } from "./mention-extension";
import { SlashCommand } from "./slash-command-extension";
import { TableControls } from "./TableControls";
import { TableRowHandles } from "./TableRowHandles";
import { blocksQueryOptions, saveBlocksKey } from "./blocks-query";
import { UniqueBlockId } from "./unique-block-id";
import { HeadingAnchors, type PageSection, pageSections } from "./heading-anchors";

const DEBOUNCE_MS = 600;
const MENTION_HREF_PREFIX = "mention:";

/// What a block was last saved as, compared on every save to skip unchanged ones.
interface PersistedBlock {
  content: string;
  blockType: string;
  language?: string;
  filename?: string;
  /// `attrsKey` of the block's attrs.
  attrs: string;
}

function persistedOf(block: Block): PersistedBlock {
  return {
    content: block.content,
    blockType: block.blockType,
    language: block.language ?? undefined,
    filename: block.filename ?? undefined,
    attrs: attrsKey(block.attrs),
  };
}

/// One continuous document, not N glued textareas (§ notes rewrite) — a single
/// Tiptap/ProseMirror editor owns the whole page, exactly like Notion. Each
/// top-level node still round-trips to one row in the existing per-block backend
/// (`block-markdown.ts`); this component's only extra job is reconciling the two.
export function BlockEditor({
  entityId,
  spaceId,
  compact = false,
  onSectionsChange,
}: {
  entityId: string;
  spaceId: string;
  /// The page's headings, whenever they change, for a section navigator.
  onSectionsChange?: (sections: PageSection[]) => void;
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
  // content: one render pass. After that the editor is the source of truth;
  // `HydratedBlockEditor` only pulls in later refetches that bring changes made
  // outside this editor (an agent writing through the CLI).
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
      onSectionsChange={onSectionsChange}
    />
  );
}

function HydratedBlockEditor({
  entityId,
  spaceId,
  compact,
  initialBlocks,
  onSectionsChange,
}: {
  entityId: string;
  spaceId: string;
  compact: boolean;
  initialBlocks: Block[];
  onSectionsChange?: (sections: PageSection[]) => void;
}) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const { data: serverBlocks } = useQuery(blocksQueryOptions(entityId));
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
      new Map<string, PersistedBlock>(initialBlocks.map((block) => [block.id, persistedOf(block)])),
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
        const next: PersistedBlock = {
          content: input.content,
          blockType: input.blockType,
          language: input.language,
          filename: input.filename,
          attrs: attrsKey(input.attrs),
        };
        if (!prior) {
          const created = await createBlock(
            entityId,
            input.blockType,
            input.content,
            null,
            input.language ?? null,
            input.filename ?? null,
            input.attrs ?? null,
          );
          idMap.set(input.blockId, created.id);
          previous.set(input.blockId, next);
        } else if (
          prior.content !== next.content ||
          prior.blockType !== next.blockType ||
          prior.language !== next.language ||
          prior.filename !== next.filename ||
          prior.attrs !== next.attrs
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
              ...(input.attrs && { attrs: input.attrs }),
            });
          }
          previous.set(input.blockId, next);
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
        // Replaced by `Divider`, the same rule saved as a `divider` block.
        horizontalRule: false,
      }),
      CodeBlockWithHeader.configure({ defaultLanguage: "plaintext" }),
      Placeholder.configure({ placeholder: "Type “/” for commands, or just start writing…" }),
      TableKit.configure({ table: { resizable: true } }),
      UniqueBlockId,
      HeadingAnchors,
      BlockSelection,
      SlashCommand,
      Mention.configure({ getEntities: () => entitiesRef.current }),
      Callout,
      Timeline,
      Progress,
      Tree,
      Steps,
      Stats,
      Details,
      Divider,
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
          // `mention:<id>#<blockId>` links one block of the page.
          const [targetId, blockId] = href.slice(MENTION_HREF_PREFIX.length).split("#");
          openEntity(targetId, spaceId, blockId ? { entityId: targetId, blockId } : undefined);
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

  // Reports the headings after every change to the document, including edits
  // pulled in from outside, but only when the outline itself changed.
  const onSectionsChangeRef = useRef(onSectionsChange);
  onSectionsChangeRef.current = onSectionsChange;
  useEffect(() => {
    if (!editor) return;
    let last = "";
    const report = () => {
      const sections = pageSections(editor.state.doc);
      const key = JSON.stringify(sections);
      if (key === last) return;
      last = key;
      onSectionsChangeRef.current?.(sections);
    };
    report();
    editor.on("transaction", report);
    return () => {
      editor.off("transaction", report);
    };
  }, [editor]);

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

  /// Whether `blocks` is exactly what this editor last persisted, same order.
  function matchesPersisted(blocks: Block[]) {
    if (blocks.length !== persisted.size) return false;
    const clientIdOf = new Map([...idMap].map(([clientId, serverId]) => [serverId, clientId]));
    return blocks.every((block, index) => {
      const clientId = clientIdOf.get(block.id);
      const prior = clientId ? persisted.get(clientId) : undefined;
      return (
        prior !== undefined &&
        orderRef.current[index] === block.id &&
        prior.content === block.content &&
        prior.blockType === block.blockType &&
        prior.language === (block.language ?? undefined) &&
        prior.filename === (block.filename ?? undefined) &&
        prior.attrs === attrsKey(block.attrs)
      );
    });
  }

  /// Pulls in blocks changed outside this editor (an agent writing through the
  /// CLI; `useExternalDbChanges` refetches on every external write). Local edits
  /// win: while a save is pending or in flight this waits, and runs again once it
  /// settles. Replaces the document without emitting an update (so no save) or an
  /// undo step, and puts the cursor back at the same offset in the same block.
  const syncFromServerRef = useRef(() => {});
  syncFromServerRef.current = () => {
    if (!editor || editor.isDestroyed) return;
    if (debounceRef.current || pendingNodesRef.current || reconcile.isPending) return;
    const blocks = queryClient.getQueryData(blocksQueryOptions(entityId).queryKey);
    if (!blocks || matchesPersisted(blocks)) return;

    let anchor: { blockId: string; offset: number } | null = null;
    const { from } = editor.state.selection;
    for (let i = 0, pos = 0; i < editor.state.doc.childCount; i++) {
      const node = editor.state.doc.child(i);
      if (from >= pos && from <= pos + node.nodeSize) {
        const clientId = asString(node.attrs.blockId);
        if (clientId) anchor = { blockId: idMap.get(clientId) ?? clientId, offset: from - pos };
        break;
      }
      pos += node.nodeSize;
    }

    idMap.clear();
    persisted.clear();
    for (const block of blocks) {
      idMap.set(block.id, block.id);
      persisted.set(block.id, persistedOf(block));
    }
    orderRef.current = blocks.map((block) => block.id);

    editor
      .chain()
      .setMeta("addToHistory", false)
      .setContent(
        {
          type: "doc",
          content: blocks.length > 0 ? blocks.map(blockToNode) : [{ type: "paragraph" }],
        },
        { emitUpdate: false },
      )
      .run();

    if (!anchor) return;
    const { doc, tr } = editor.state;
    for (let i = 0, pos = 0; i < doc.childCount; i++) {
      const node = doc.child(i);
      if (node.attrs.blockId === anchor.blockId) {
        const at = Math.min(pos + anchor.offset, pos + node.nodeSize - 1, doc.content.size);
        tr.setSelection(TextSelection.near(doc.resolve(at))).setMeta("addToHistory", false);
        editor.view.dispatch(tr);
        break;
      }
      pos += node.nodeSize;
    }
  };
  useEffect(() => syncFromServerRef.current(), [serverBlocks, reconcile.isPending]);

  // Leaving the page inside the debounce window saves right away instead of
  // dropping the last edits. `useEditor` destroys its editor on a later tick, so
  // the document is still readable here.
  useEffect(
    () => () => {
      if (debounceRef.current) flushRef.current();
    },
    [],
  );

  /// Saves anything still pending, then maps a block's client id to its stored
  /// id, which is what a link to the block has to point at.
  const resolveStoredId = async (blockId: string): Promise<string | null> => {
    if (debounceRef.current) flushRef.current();
    const saveKey = { mutationKey: saveBlocksKey(entityId) };
    for (let tries = 0; tries < 100 && queryClient.isMutating(saveKey) > 0; tries++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return idMap.get(blockId) ?? null;
  };

  /// Right-clicking a block, or the gutter beside it, targets that block; the
  /// rest of the canvas targets the page as a whole.
  const blockContextTarget = contextTargetAt((event) => {
    if (!editor) return undefined;
    const dom = editor.view.dom;
    const box = dom.getBoundingClientRect();
    const inGutter = event.clientX >= box.left && event.clientX < box.left + GUTTER_WIDTH;
    const probed = inGutter
      ? document.elementFromPoint(box.left + GUTTER_WIDTH + 1, event.clientY)
      : event.target instanceof Element
        ? event.target
        : null;
    const element = topLevelElement(dom, probed);
    const block = element && findTopLevelBlock(editor.view, element);
    const blockId = block ? asString(block.node.attrs.blockId) : undefined;
    return blockId
      ? makeTarget("note.block", { editor, blockId, entityId, resolveStoredId })
      : makeTarget("note.canvas", {
          editor,
          overText: event.target instanceof Node && dom.contains(event.target),
        });
  });

  return (
    <div className="relative" {...blockContextTarget}>
      <TableControls editor={editor} />
      <TableRowHandles editor={editor} />
      <BlockHandles editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
