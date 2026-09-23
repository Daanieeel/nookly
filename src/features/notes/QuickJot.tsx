import * as DialogPrimitive from "@radix-ui/react-dialog";
import { IconChevronDown, IconFeather } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FieldError, StatusIcon, statusOf } from "@/components/action-feedback";
import { SpaceGlyph } from "@/components/spotlight";
import { DialogPortal } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { softDeleteEntity } from "@/lib/api/entities";
import { createBlock, createJot } from "@/lib/api/notes";
import { listSpaces } from "@/lib/api/spaces";
import type { Entity, Space } from "@/lib/api/types";
import { useNavStore } from "@/lib/store/nav";
import { cn } from "@/lib/utils";
import { jotTextToBlocks } from "./jot-blocks";

/// Tallest the capture box grows before it scrolls, in pixels.
const MAX_COMPOSER_HEIGHT = 320;

/// The one Jot capture mechanism (§ creation UX: "near instant, no friction"). Plain
/// text in, an untitled Jot out: no title, no Space decision, no block editor. Every
/// entry point (the dialog below, a future inline capture box) wraps this same hook
/// and `JotComposer`, so they can never drift apart.
export function useJotCapture({
  spaceId,
  onSaved,
}: {
  spaceId: string | null;
  onSaved: (entity: Entity) => void;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  // Enter and Escape can both land in one tick, before `isPending` updates.
  const inFlight = useRef(false);

  const save = useMutation({
    mutationFn: async (targetSpaceId: string) => {
      const entity = await createJot(targetSpaceId, "");
      try {
        for (const block of jotTextToBlocks(text)) {
          await createBlock(entity.id, block.blockType, block.content, null, block.language);
        }
      } catch (err) {
        // A half written Jot would duplicate on retry; the text stays in the box instead.
        await softDeleteEntity(entity.id).catch(() => undefined);
        throw err;
      }
      return entity;
    },
    onSuccess: (entity) => {
      queryClient.invalidateQueries({ queryKey: ["entities", entity.spaceId] });
      queryClient.invalidateQueries({ queryKey: ["unrefined-jots"] });
      setText("");
      onSaved(entity);
    },
    onSettled: () => {
      inFlight.current = false;
    },
  });

  const empty = text.trim() === "";
  return {
    text,
    setText,
    empty,
    save,
    /// Saves real content; returns `false` when there was nothing to save.
    submit: (): boolean => {
      if (empty || !spaceId) return false;
      if (!inFlight.current) {
        inFlight.current = true;
        save.mutate(spaceId);
      }
      return true;
    },
  };
}

type JotCapture = ReturnType<typeof useJotCapture>;

export function JotComposer({
  capture,
  onCancel,
  className,
}: {
  capture: JotCapture;
  /// Escape on an empty box. Escape with content saves instead, so a habit key press
  /// never loses what was typed.
  onCancel: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Capture starts typing right away, wherever the composer is mounted.
  useEffect(() => ref.current?.focus(), []);

  // Grows with the text, like a chat composer, instead of reserving a big empty canvas.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSER_HEIGHT)}px`;
  }, [capture.text]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={capture.text}
      onChange={(e) => {
        capture.setText(e.target.value);
        if (capture.save.isError) capture.save.reset();
      }}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          capture.submit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          if (!capture.submit()) onCancel();
        }
      }}
      placeholder="Jot something down"
      aria-label="Jot"
      aria-invalid={capture.save.isError || undefined}
      readOnly={capture.save.isPending}
      className={cn(
        "block w-full resize-none overflow-y-auto bg-transparent text-sm/relaxed outline-none placeholder:text-muted-foreground",
        className,
      )}
    />
  );
}

/// Cmd+J from anywhere, the sidebar's Quick Jot entry, and the Jots list's New Jot
/// action all open this. Mounted once at the app root.
export function QuickJotDialog() {
  const open = useNavStore((s) => s.quickJotOpen);
  const setOpen = useNavStore((s) => s.setQuickJotOpen);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setOpen]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      {/* Remounted per opening, so every capture starts blank in the active Space. */}
      {open && <QuickJotSurface onClose={() => setOpen(false)} />}
    </DialogPrimitive.Root>
  );
}

function QuickJotSurface({ onClose }: { onClose: () => void }) {
  const activeSpaceId = useNavStore((s) => s.activeSpaceId);
  const openEntity = useNavStore((s) => s.openEntity);
  const { data: spaces = [] } = useQuery({ queryKey: ["spaces"], queryFn: listSpaces });
  const [pickedSpaceId, setPickedSpaceId] = useState<string | null>(null);
  const space =
    spaces.find((s) => s.id === (pickedSpaceId ?? activeSpaceId)) ?? spaces[0] ?? undefined;

  const capture = useJotCapture({
    spaceId: space?.id ?? null,
    onSaved: (entity) => {
      onClose();
      // The dialog is gone, so nothing on screen is left to confirm the save.
      toast.success("Jot saved", {
        action: { label: "Open", onClick: () => openEntity(entity.id, entity.spaceId) },
      });
    },
  });

  // Leaving by Escape or a click outside saves real content rather than dropping it.
  const leave = (e: Event) => {
    e.preventDefault();
    if (!capture.submit()) onClose();
  };

  return (
    <DialogPortal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        onEscapeKeyDown={leave}
        onInteractOutside={leave}
        className={cn(
          "fixed bottom-[12vh] left-1/2 z-50 flex w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 flex-col",
          "rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl ring-1 ring-foreground/5 outline-none",
          "duration-150 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-2",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom-2",
        )}
      >
        <DialogPrimitive.Title className="sr-only">Quick Jot</DialogPrimitive.Title>
        {spaces.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">
            Create a Space first, then Jots have somewhere to land.
          </p>
        ) : (
          <>
            <div className="flex items-start gap-2.5 px-3.5 pt-3 pb-2">
              <span className="flex h-6 shrink-0 items-center">
                <StatusIcon
                  status={statusOf(capture.save)}
                  size={16}
                  idle={<IconFeather size={16} className="shrink-0 text-muted-foreground" />}
                />
              </span>
              <JotComposer capture={capture} onCancel={onClose} className="min-w-0 flex-1" />
            </div>
            <div className="px-3.5">
              <FieldError
                message={capture.save.isError && "Couldn't save the Jot. Press Enter to try again."}
              />
            </div>
            <div className="flex items-center gap-3 px-2 pb-2 text-xs text-muted-foreground">
              {space && (
                <SpaceChip space={space} spaces={spaces} onPick={(id) => setPickedSpaceId(id)} />
              )}
              <span className="ml-auto flex items-center gap-1">
                <Kbd>↵</Kbd> Save
              </span>
              <span className="flex items-center gap-1">
                <Kbd>⇧</Kbd>
                <Kbd>↵</Kbd> New line
              </span>
            </div>
          </>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

/// Where the Jot lands. Quiet on purpose: the active Space is almost always right, so
/// this reads as a note, not a question to answer before writing.
function SpaceChip({
  space,
  spaces,
  onPick,
}: {
  space: Space;
  spaces: Space[];
  onPick: (spaceId: string) => void;
}) {
  const label = (
    <>
      <SpaceGlyph space={space} size={12} />
      <span className="max-w-40 truncate">{space.name}</span>
    </>
  );
  if (spaces.length < 2) {
    return <span className="flex items-center gap-1.5 px-1.5">{label}</span>;
  }
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-6 items-center gap-1.5 rounded-sm px-1.5 hover:bg-accent hover:text-foreground"
            >
              {label}
              <IconChevronDown size={12} />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Change Space</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DropdownMenuRadioGroup value={space.id} onValueChange={onPick}>
          {spaces.map((s) => (
            <DropdownMenuRadioItem key={s.id} value={s.id} className="gap-2">
              <SpaceGlyph space={s} size={14} />
              <span className="truncate">{s.name}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
