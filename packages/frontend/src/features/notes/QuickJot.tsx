import { qk } from "#/lib/query-keys.ts";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { IconCalendarEvent, IconChevronDown, IconFeather } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FieldError, StatusIcon, statusOf } from "#/components/action-feedback.tsx";
import { SpaceGlyph } from "#/components/spotlight.tsx";
import { DialogPortal } from "@nookly/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@nookly/ui/components/dropdown-menu";
import { Kbd } from "#/components/kbd.tsx";
import { ShortcutKbd } from "#/components/shortcut-kbd.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { softDeleteEntity } from "#/lib/api/entities.ts";
import { createBlock, createJot } from "#/lib/api/notes.ts";
import { createSessionPage, getSessionPages, listSessionsAll } from "#/lib/api/sessions.ts";
import { findCurrentSession } from "#/features/sessions/next-session.ts";
import { sessionPageTitle } from "#/features/sessions/calendar/SessionPopover.tsx";
import { listSpaces } from "#/lib/api/spaces.ts";
import type { Entity, SessionOccurrence, Space } from "#/lib/api/types.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { cn } from "@nookly/ui/lib/utils";
import { jotTextToBlocks } from "./jot-blocks";
import { useAppHotkey } from "#/hooks/use-app-hotkey.ts";

/// Tallest the capture box grows before it scrolls, in pixels.
const MAX_COMPOSER_HEIGHT = 320;

/// The one Jot capture mechanism (§ creation UX: "near instant, no friction"). Plain
/// text in, an untitled Jot out: no title, no Space decision, no block editor. Every
/// entry point (the dialog below, a future inline capture box) wraps this same hook
/// and `JotComposer`, so they can never drift apart.
export function useJotCapture({
  spaceId,
  session = null,
  onSaved,
}: {
  spaceId: string | null;
  /// Writes into this occurrence's Jot (created on first use) instead of a new loose Jot.
  session?: SessionOccurrence | null;
  onSaved: (entity: Entity) => void;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  // Enter and Escape can both land in one tick, before `isPending` updates.
  const inFlight = useRef(false);

  // Blocks already appended to a Jot that existed before, so a retry never repeats them.
  const appended = useRef(0);

  const save = useMutation({
    mutationFn: async (targetSpaceId: string) => {
      const existing = session ? (await getSessionPages(session.entity.id)).jot : null;
      const created = existing === null;
      const entity =
        existing ??
        (session
          ? await createSessionPage(session.entity.id, "jot", sessionPageTitle(session))
          : await createJot(targetSpaceId, ""));
      try {
        const blocks = jotTextToBlocks(text);
        for (const block of created ? blocks : blocks.slice(appended.current)) {
          await createBlock(
            entity.id,
            block.blockType,
            block.content,
            null,
            block.language,
            null,
            block.attrs ?? null,
          );
          if (!created) appended.current += 1;
        }
      } catch (err) {
        // A half written new Jot would duplicate on retry; the text stays in the box
        // instead. A Jot that existed before is never deleted, only what this call made.
        if (created) await softDeleteEntity(entity.id).catch(() => undefined);
        throw err;
      }
      appended.current = 0;
      return entity;
    },
    onSuccess: (entity) => {
      queryClient.invalidateQueries({ queryKey: qk.entities.bySpace(entity.spaceId) });
      queryClient.invalidateQueries({ queryKey: qk.jots.unrefined });
      if (session) {
        queryClient.invalidateQueries({ queryKey: qk.sessions.pages(session.entity.id) });
        queryClient.invalidateQueries({ queryKey: qk.blocks(entity.id) });
      }
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
  const queryClient = useQueryClient();

  useAppHotkey("quickJot", () => setOpen(true));
  // Binds to the session running now; without one this is the plain quick jot.
  useAppHotkey("quickJotSession", () => {
    void queryClient
      .fetchQuery({ queryKey: qk.sessions.all, queryFn: listSessionsAll, staleTime: 30_000 })
      .then((sessions) => findCurrentSession(sessions, new Date()))
      .catch(() => undefined)
      .then((current) => {
        if (current) useNavStore.getState().openQuickJotForSession(current.entity.id);
        else setOpen(true);
      });
  });

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      {/* Remounted per opening, so every capture starts blank in the active Space. */}
      {open && <QuickJotSurface onClose={() => setOpen(false)} />}
    </DialogPrimitive.Root>
  );
}

function QuickJotSurface({ onClose }: { onClose: () => void }) {
  const activeSpaceId = useNavStore((s) => s.activeSpaceId);
  const sessionId = useNavStore((s) => s.quickJotSessionId);
  const openEntity = useNavStore((s) => s.openEntity);
  const { data: spaces = [] } = useQuery({ queryKey: qk.spaces, queryFn: listSpaces });
  const { data: sessions } = useQuery({
    queryKey: qk.sessions.all,
    queryFn: listSessionsAll,
    enabled: sessionId !== null,
  });
  const session = sessionId ? (sessions?.find((s) => s.entity.id === sessionId) ?? null) : null;
  const [pickedSpaceId, setPickedSpaceId] = useState<string | null>(null);
  // A session Jot lives in the session's Space, whatever Space is active.
  const space =
    spaces.find((s) => s.id === (session?.entity.spaceId ?? pickedSpaceId ?? activeSpaceId)) ??
    spaces[0] ??
    undefined;

  const capture = useJotCapture({
    spaceId: space?.id ?? null,
    session,
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
              {session ? (
                <span className="flex min-w-0 items-center gap-1.5 px-1.5">
                  <IconCalendarEvent size={12} className="shrink-0" />
                  <span className="max-w-56 truncate">{sessionPageTitle(session)}</span>
                </span>
              ) : (
                space && (
                  <SpaceChip space={space} spaces={spaces} onPick={(id) => setPickedSpaceId(id)} />
                )
              )}
              {!session && (
                <span className="ml-auto flex items-center gap-1">
                  <ShortcutKbd name="quickJotSession" /> Session jot
                </span>
              )}
              <span className={cn("flex items-center gap-1", session && "ml-auto")}>
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
