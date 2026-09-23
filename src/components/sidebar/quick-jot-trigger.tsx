import { IconFeather } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  FieldError,
  StatusAnnouncer,
  StatusButtonContent,
  StatusIcon,
  statusOf,
} from "@/components/action-feedback";
import { EntityIcon } from "@/components/entity-icon";
import { IconPicker } from "@/components/icon-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
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
          <KbdGroup className="ml-auto group-data-[collapsible=icon]:hidden">
            <Kbd>⌘</Kbd>
            <Kbd>J</Kbd>
          </KbdGroup>
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
  const saveIcon = useMutation({
    mutationFn: (vars: { id: string; icon: string | null }) =>
      updateEntity(vars.id, { icon: vars.icon ?? "" }),
  });
  const saveTitle = useMutation({
    mutationFn: (vars: { id: string; title: string }) =>
      updateEntity(vars.id, { title: vars.title }),
  });

  function createIn(targetSpaceId: string) {
    create.mutate(targetSpaceId, { onSuccess: (entity) => setEntityId(entity.id) });
  }

  // The dialog is already closing, so no control is left to carry this failure.
  function discard(id: string) {
    softDeleteEntity(id).catch(() => {
      toast.error("Couldn't discard the empty Jot", {
        description: "It stays in your Jots list. Move it to Trash from there.",
      });
    });
  }

  useEffect(() => {
    if (!open) return;
    const initialSpaceId = activeSpaceId ?? spaces[0]?.id ?? null;
    setSpaceId(initialSpaceId);
    setEntityId(null);
    setIcon(null);
    setTitle("");
    saveIcon.reset();
    saveTitle.reset();
    if (initialSpaceId) createIn(initialSpaceId);
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
    createIn(nextSpaceId);
    if (staleEntityId) discard(staleEntityId);
  }

  function handleOpenChange(next: boolean) {
    if (!next && entityId && pristine) discard(entityId);
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
              if (entityId) saveIcon.mutate({ id: entityId, icon: next });
            }}
            trigger={
              <button
                type="button"
                title={saveIcon.isError ? "Couldn't change icon, try again" : "Change icon"}
                className="flex size-7 shrink-0 items-center justify-center rounded-sm hover:bg-accent"
              >
                <StatusIcon
                  status={saveIcon.isError ? "error" : "idle"}
                  size={17}
                  idle={
                    <EntityIcon
                      entity={{ type: "jot", icon }}
                      size={17}
                      className="shrink-0 text-muted-foreground"
                    />
                  }
                />
              </button>
            }
          />
          <StatusAnnouncer message={saveIcon.isError ? "Couldn't change icon" : null} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <input
              ref={titleInputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                if (entityId && title.trim())
                  saveTitle.mutate({ id: entityId, title: title.trim() });
              }}
              placeholder="Untitled Jot"
              aria-invalid={saveTitle.isError || undefined}
              className="min-w-0 truncate bg-transparent text-base font-medium outline-none placeholder:text-muted-foreground"
            />
            <FieldError
              message={saveTitle.isError && "Couldn't save the title, leave the field to retry"}
            />
          </div>
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
          ) : spaces.length === 0 ? (
            <p className="text-sm text-muted-foreground">Create a Space first.</p>
          ) : create.isError && spaceId ? (
            <div className="flex flex-col items-start gap-2">
              <p role="alert" className="text-sm text-destructive">
                Couldn't create the Jot. {create.error.message}
              </p>
              <Button variant="secondary" size="sm" onClick={() => createIn(spaceId)}>
                Try again
              </Button>
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <StatusButtonContent
                status={statusOf(create)}
                label="Setting up…"
                errorLabel="Couldn't create the Jot"
              />
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
