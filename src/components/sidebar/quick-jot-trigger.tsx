import { IconFeather } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { EntityIcon } from "@/components/entity-icon";
import { IconPicker } from "@/components/icon-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { softDeleteEntity, updateEntity } from "@/lib/api/entities";
import { createJot, listBlocks } from "@/lib/api/notes";
import { listSpaces } from "@/lib/api/spaces";
import { BlockEditor } from "@/features/notes/BlockEditor";
import { useNavStore } from "@/lib/store/nav";

export function QuickJotTrigger() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <SidebarMenuItem>
        <SidebarMenuButton tooltip="Quick Jot" onClick={() => setOpen(true)}>
          <IconFeather />
          <span>Quick Jot</span>
          <kbd className="ml-auto rounded border border-sidebar-border bg-sidebar-accent/50 px-1 py-0.5 font-sans text-xs text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden">
            ⌘J
          </kbd>
        </SidebarMenuButton>
      </SidebarMenuItem>
      <QuickJotDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function QuickJotDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const activeSpaceId = useNavStore((s) => s.activeSpaceId);
  const { data: spaces = [] } = useQuery({ queryKey: ["spaces"], queryFn: listSpaces });

  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [entityId, setEntityId] = useState<string | null>(null);
  const [icon, setIcon] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);

  const { data: blocks = [] } = useQuery({
    queryKey: ["blocks", entityId ?? ""],
    // SAFETY: `enabled` gates this on `entityId !== null`, so it never runs
    // with a null id despite the parameter type.
    queryFn: () => listBlocks(entityId as string),
    enabled: entityId !== null,
  });
  // Nothing captured yet — safe to silently discard or re-target this Jot.
  const pristine = title.trim() === "" && blocks.length === 0;

  const create = useMutation({
    mutationFn: (targetSpaceId: string) => createJot(targetSpaceId, ""),
  });

  useEffect(() => {
    if (!open) return;
    const initialSpaceId = activeSpaceId ?? spaces[0]?.id ?? null;
    setSpaceId(initialSpaceId);
    setEntityId(null);
    setIcon(null);
    setTitle("");
    if (initialSpaceId) {
      create.mutate(initialSpaceId, {
        onSuccess: (entity) => setEntityId(entity.id),
      });
    }
    titleInputRef.current?.focus();
    // SAFETY: only re-run when the dialog transitions open — re-running on every
    // `spaces`/`activeSpaceId` change would recreate the Jot mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleSpaceChange(nextSpaceId: string) {
    if (!pristine || nextSpaceId === spaceId) return;
    const staleEntityId = entityId;
    setSpaceId(nextSpaceId);
    setEntityId(null);
    create.mutate(nextSpaceId, {
      onSuccess: (entity) => setEntityId(entity.id),
    });
    if (staleEntityId) void softDeleteEntity(staleEntityId);
  }

  function handleOpenChange(next: boolean) {
    if (!next && entityId && pristine) {
      void softDeleteEntity(entityId);
    }
    if (!next && entityId && spaceId) {
      queryClient.invalidateQueries({ queryKey: ["entities", spaceId] });
      queryClient.invalidateQueries({ queryKey: ["jots-without-refinement", spaceId] });
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[80vh] w-full max-w-2xl flex-col gap-3 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="sr-only">Quick Jot</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 border-b border-border pb-3">
          <IconPicker
            value={icon}
            onChange={(next) => {
              setIcon(next);
              if (entityId) updateEntity(entityId, { icon: next ?? "" });
            }}
            trigger={
              <button
                type="button"
                title="Change icon"
                className="flex size-7 shrink-0 items-center justify-center rounded-sm hover:bg-accent"
              >
                <EntityIcon
                  entity={{ type: "jot", icon }}
                  size={17}
                  className="shrink-0 text-muted-foreground"
                />
              </button>
            }
          />
          <input
            ref={titleInputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() =>
              entityId && title.trim() && updateEntity(entityId, { title: title.trim() })
            }
            placeholder="Untitled Jot"
            className="min-w-0 flex-1 truncate bg-transparent text-base font-medium outline-none placeholder:text-muted-foreground"
          />
          <Select
            value={spaceId ?? undefined}
            onValueChange={handleSpaceChange}
            disabled={!pristine || spaces.length === 0}
          >
            <SelectTrigger size="sm" className="w-36 shrink-0">
              <SelectValue placeholder="Space" />
            </SelectTrigger>
            <SelectContent align="end">
              {spaces.map((space) => (
                <SelectItem key={space.id} value={space.id}>
                  {space.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-h-40 flex-1 overflow-y-auto">
          {entityId && spaceId ? (
            <BlockEditor entityId={entityId} spaceId={spaceId} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {spaces.length === 0 ? "Create a Space first." : "Setting up…"}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
