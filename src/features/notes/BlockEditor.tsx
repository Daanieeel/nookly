import { IconArrowDown, IconArrowUp, IconAt, IconPlus, IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { EntityPickerPopover } from "@/components/entity-picker";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createBlock, deleteBlock, listBlocks, reorderBlocks, updateBlock } from "@/lib/api/notes";
import type { Block, BlockType } from "@/lib/api/types";
import { mentionMarkdown } from "@/features/relationships/mention-utils";

const BLOCK_TYPES: { value: BlockType; label: string }[] = [
  { value: "paragraph", label: "Paragraph" },
  { value: "heading1", label: "Heading 1" },
  { value: "heading2", label: "Heading 2" },
  { value: "heading3", label: "Heading 3" },
  { value: "quote", label: "Quote" },
  { value: "code", label: "Code" },
  { value: "bulleted_list", label: "Bulleted list" },
  { value: "numbered_list", label: "Numbered list" },
  { value: "image", label: "Image URL" },
  { value: "embed", label: "Embed URL" },
];

export function BlockEditor({ entityId, spaceId }: { entityId: string; spaceId: string }) {
  const queryClient = useQueryClient();
  const [newType, setNewType] = useState<BlockType>("paragraph");
  const { data: blocks = [] } = useQuery({
    queryKey: ["blocks", entityId],
    queryFn: () => listBlocks(entityId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["blocks", entityId] });

  const addBlock = useMutation({
    mutationFn: () => createBlock(entityId, newType, ""),
    onSuccess: invalidate,
  });
  const editBlock = useMutation({
    mutationFn: (vars: { id: string; content: string }) => updateBlock(vars.id, vars.content),
    onSuccess: invalidate,
  });
  const removeBlock = useMutation({
    mutationFn: (id: string) => deleteBlock(id),
    onSuccess: invalidate,
  });
  const move = useMutation({
    mutationFn: (ids: string[]) => reorderBlocks(entityId, ids),
    onSuccess: invalidate,
  });

  function moveBlock(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    const ids = blocks.map((b) => b.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    move.mutate(ids);
  }

  return (
    <div className="flex max-w-2xl flex-col gap-2">
      {blocks.map((block, index) => (
        <BlockRow
          key={block.id}
          block={block}
          spaceId={spaceId}
          onChange={(content) => editBlock.mutate({ id: block.id, content })}
          onDelete={() => removeBlock.mutate(block.id)}
          onMoveUp={() => moveBlock(index, -1)}
          onMoveDown={() => moveBlock(index, 1)}
        />
      ))}

      <div className="flex items-center gap-2 pt-2">
        <Select
          value={newType}
          onValueChange={(v) => {
            // SAFETY: `v` always comes from a SelectItem below, whose values are all BLOCK_TYPES entries.
            setNewType(v as BlockType);
          }}
        >
          <SelectTrigger size="sm" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BLOCK_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => addBlock.mutate()} className="gap-1">
          <IconPlus size={14} /> Add block
        </Button>
      </div>
    </div>
  );
}

function BlockRow({
  block,
  spaceId,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  block: Block;
  spaceId: string;
  onChange: (content: string) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [content, setContent] = useState(block.content);
  const label = BLOCK_TYPES.find((t) => t.value === block.blockType)?.label ?? block.blockType;

  return (
    <div className="group flex items-start gap-1">
      <div className="flex flex-col pt-1.5 opacity-0 group-hover:opacity-100">
        <button
          type="button"
          onClick={onMoveUp}
          className="text-muted-foreground hover:text-foreground"
        >
          <IconArrowUp size={12} />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          className="text-muted-foreground hover:text-foreground"
        >
          <IconArrowDown size={12} />
        </button>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onBlur={() => content !== block.content && onChange(content)}
          rows={block.blockType === "code" ? 4 : 2}
          className={block.blockType === "code" ? "font-mono" : undefined}
        />
      </div>
      <div className="flex flex-col gap-1 pt-6 opacity-0 group-hover:opacity-100">
        <EntityPickerPopover
          spaceId={spaceId}
          trigger={
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              title="Insert mention"
            >
              <IconAt size={14} />
            </button>
          }
          onSelect={(entity) => {
            const next = `${content ? `${content} ` : ""}${mentionMarkdown(entity.title, entity.id)}`;
            setContent(next);
            onChange(next);
          }}
        />
        <button
          type="button"
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive"
        >
          <IconTrash size={14} />
        </button>
      </div>
    </div>
  );
}
