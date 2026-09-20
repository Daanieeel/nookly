import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { listEntities } from "@/lib/api/entities";
import { createBlock, deleteBlock, listBlocks, reorderBlocks, updateBlock } from "@/lib/api/notes";
import { useNavStore } from "@/lib/store/nav";
import { type BlockInput, blockToNode, type JSONNode, nodeToBlockInput } from "./block-markdown";
import { Mention } from "./mention-extension";
import { SlashCommand } from "./slash-command-extension";
import { UniqueBlockId } from "./unique-block-id";

const DEBOUNCE_MS = 600;
const MENTION_HREF_PREFIX = "mention:";

/// One continuous document, not N glued textareas (§ notes rewrite) — a single
/// Tiptap/ProseMirror editor owns the whole page, exactly like Notion. Each
/// top-level node still round-trips to one row in the existing per-block backend
/// (`block-markdown.ts`); this component's only extra job is reconciling the two.
export function BlockEditor({ entityId, spaceId }: { entityId: string; spaceId: string }) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const { data: blocks } = useQuery({
    queryKey: ["blocks", entityId],
    queryFn: () => listBlocks(entityId),
  });
  const { data: entities = [] } = useQuery({
    queryKey: ["entities", spaceId],
    queryFn: () => listEntities(spaceId, false),
  });

  const entitiesRef = useRef(entities);
  entitiesRef.current = entities;

  const hydratedRef = useRef(false);
  /// Client-generated `blockId` (assigned by `UniqueBlockId`) -> server block id.
  /// Pre-existing blocks bootstrap this as an identity mapping (§ notes rewrite).
  const idMapRef = useRef(new Map<string, string>());
  const persistedRef = useRef(new Map<string, { content: string; blockType: string }>());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNodesRef = useRef<JSONNode[] | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["blocks", entityId] });

  const reconcile = useMutation({
    mutationFn: async (nodes: JSONNode[]) => {
      const inputs = nodes.map(nodeToBlockInput).filter((b): b is BlockInput => b !== null);
      const idMap = idMapRef.current;
      const previous = persistedRef.current;
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
        if (!prior) {
          const created = await createBlock(entityId, input.blockType, input.content, null);
          idMap.set(input.blockId, created.id);
          previous.set(input.blockId, { content: input.content, blockType: input.blockType });
        } else if (prior.content !== input.content || prior.blockType !== input.blockType) {
          const serverId = idMap.get(input.blockId);
          if (serverId) {
            await updateBlock(serverId, { content: input.content, blockType: input.blockType });
          }
          previous.set(input.blockId, { content: input.content, blockType: input.blockType });
        }
      }

      const orderedServerIds = inputs
        .map((i) => idMap.get(i.blockId))
        .filter((id): id is string => Boolean(id));
      if (orderedServerIds.length > 0) await reorderBlocks(entityId, orderedServerIds);
    },
    onSettled: () => {
      const pending = pendingNodesRef.current;
      pendingNodesRef.current = null;
      if (pending) runReconcile(pending);
      else invalidate();
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
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: false,
          protocols: [{ scheme: "mention", optionalSlashes: true }],
        },
      }),
      Placeholder.configure({ placeholder: "Type “/” for commands, or just start writing…" }),
      UniqueBlockId,
      SlashCommand,
      Mention.configure({ getEntities: () => entitiesRef.current }),
    ],
    editorProps: {
      attributes: { class: "tiptap-content min-h-40 text-sm leading-relaxed" },
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
    onUpdate: ({ editor: instance }) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const doc = instance.getJSON();
        // SAFETY: `getJSON()`'s recursive `{type, attrs, content, text, marks}` shape
        // structurally satisfies the `JSONNode` subset this module actually reads.
        runReconcile((doc.content ?? []) as JSONNode[]);
      }, DEBOUNCE_MS);
    },
  });

  useEffect(() => {
    if (!editor || !blocks || hydratedRef.current) return;
    hydratedRef.current = true;
    for (const block of blocks) {
      idMapRef.current.set(block.id, block.id);
      persistedRef.current.set(block.id, { content: block.content, blockType: block.blockType });
    }
    const content = blocks.length > 0 ? blocks.map(blockToNode) : [{ type: "paragraph" }];
    editor.commands.setContent({ type: "doc", content });
  }, [editor, blocks]);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  return <EditorContent editor={editor} />;
}
