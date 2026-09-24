import {
  IconArrowUpRight,
  IconCalendarX,
  IconClock,
  IconMapPin,
  IconPencil,
  IconRepeat,
  IconRestore,
  IconTrash,
} from "@tabler/icons-react";
import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";
import {
  FieldError,
  StatusAnnouncer,
  StatusButtonContent,
  StatusIcon,
  statusOf,
  useActionStatus,
  useCloseAfterSuccess,
} from "@/components/action-feedback";
import { EntityIcon } from "@/components/entity-icon";
import { EntityMention } from "@/components/entity-mention";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { restoreEntity, softDeleteEntity, updateEntity } from "@/lib/api/entities";
import {
  type SeriesPatch,
  createSessionPage,
  deleteSessionSeries,
  getSessionPages,
  listSessions,
  overrideOccurrence,
  updateSessionSeries,
} from "@/lib/api/sessions";
import type { SessionOccurrence } from "@/lib/api/types";
import { formatClock, formatShortDate, formatWeekday } from "@/lib/datetime";
import { displayTitle } from "@/lib/entity-title";
import { MODULE_ICONS } from "@/lib/modules";
import { useNavStore } from "@/lib/store/nav";

/// Which occurrences an edit reaches, as in any calendar. A series edit never
/// rewrites past occurrences or fields an occurrence changed on its own.
type EditScope = "this" | "following" | "upcoming";

const SCOPES = [
  { id: "this", label: "This session" },
  { id: "following", label: "This and following" },
  { id: "upcoming", label: "All upcoming" },
] satisfies { id: EditScope; label: string }[];

function refreshSessions(queryClient: QueryClient, spaceId: string, entityId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["sessions", spaceId] }),
    queryClient.invalidateQueries({ queryKey: ["entity", entityId] }),
  ]);
}

/// Clicking a Session on the calendar opens this instead of leaving the page:
/// its details, edits for this occurrence or its series, and the Jot and Note
/// written for this one occurrence.
export function SessionPopover({
  spaceId,
  occurrence,
  children,
}: {
  spaceId: string;
  occurrence: SessionOccurrence;
  /// The calendar block or month line that opens it.
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [seriesDeleteOpen, setSeriesDeleteOpen] = useState(false);

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setEditing(false);
        }}
      >
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent align="start" className="flex w-80 flex-col text-sm">
          {editing ? (
            <SessionEditForm
              spaceId={spaceId}
              occurrence={occurrence}
              onDone={() => setEditing(false)}
            />
          ) : (
            <SessionSummary
              spaceId={spaceId}
              occurrence={occurrence}
              onEdit={() => setEditing(true)}
              onDeleteSeries={() => {
                setOpen(false);
                setSeriesDeleteOpen(true);
              }}
              close={() => setOpen(false)}
            />
          )}
          <SessionPages spaceId={spaceId} occurrence={occurrence} close={() => setOpen(false)} />
        </PopoverContent>
      </Popover>
      {occurrence.templateId && (
        <DeleteSeriesDialog
          spaceId={spaceId}
          occurrence={occurrence}
          templateId={occurrence.templateId}
          open={seriesDeleteOpen}
          onOpenChange={setSeriesDeleteOpen}
        />
      )}
    </>
  );
}

function SessionSummary({
  spaceId,
  occurrence,
  onEdit,
  onDeleteSeries,
  close,
}: {
  spaceId: string;
  occurrence: SessionOccurrence;
  onEdit: () => void;
  onDeleteSeries: () => void;
  close: () => void;
}) {
  const queryClient = useQueryClient();
  const { entity } = occurrence;
  const toggleCancelled = useMutation({
    mutationFn: async () => {
      await overrideOccurrence(entity.id, { cancelled: !occurrence.cancelled });
      await refreshSessions(queryClient, spaceId, entity.id);
    },
  });
  const toggleStatus = useActionStatus(toggleCancelled);
  const toggleLabel =
    toggleStatus === "error"
      ? "Couldn't save, try again"
      : occurrence.cancelled
        ? "Restore Session"
        : "Cancel Session";
  const trash = useMutation({
    mutationFn: () => softDeleteEntity(entity.id),
    onSuccess: async () => {
      close();
      await refreshSessions(queryClient, spaceId, entity.id);
      // The block is gone from the calendar, so nothing is left on screen to confirm it.
      toast.success("Session moved to Trash", {
        action: {
          label: "Undo",
          onClick: () =>
            void restoreEntity(entity.id).then(() =>
              refreshSessions(queryClient, spaceId, entity.id),
            ),
        },
      });
    },
  });

  return (
    <div className="flex flex-col gap-2.5 p-3">
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-semibold wrap-break-word">{displayTitle(entity)}</span>
          {occurrence.courseTitle && (
            <span className="text-muted-foreground wrap-break-word">{occurrence.courseTitle}</span>
          )}
        </div>
        {occurrence.cancelled && <Badge variant="secondary">Cancelled</Badge>}
        <div className="-mt-1 -mr-1 flex shrink-0 items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="iconSm"
                aria-label={toggleLabel}
                onClick={() => !toggleCancelled.isPending && toggleCancelled.mutate()}
              >
                <StatusIcon
                  status={toggleStatus}
                  idle={occurrence.cancelled ? <IconRestore /> : <IconCalendarX />}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{toggleLabel}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="iconSm" aria-label="Edit Session" onClick={onEdit}>
                <IconPencil />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit Session</TooltipContent>
          </Tooltip>
          {occurrence.templateId ? (
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="iconSm" aria-label="Delete Session">
                      <StatusIcon status={statusOf(trash)} idle={<IconTrash />} />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>Delete Session</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => trash.mutate()}>
                  Delete this session
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onDeleteSeries}>
                  Delete this and following…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="iconSm"

                  aria-label="Delete Session"
                  onClick={() => !trash.isPending && trash.mutate()}
                >
                  <StatusIcon status={statusOf(trash)} idle={<IconTrash />} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete Session</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 text-muted-foreground">
        <span className="flex items-start gap-2">
          <IconClock size={14} className="mt-0.5 shrink-0" />
          {formatWeekday(occurrence.date)}, {formatShortDate(occurrence.date)},{" "}
          {formatClock(occurrence.startTime)} to {formatClock(occurrence.endTime)}
        </span>
        {occurrence.location && (
          <span className="flex items-start gap-2">
            <IconMapPin size={14} className="mt-0.5 shrink-0" />
            <span className="wrap-break-word">{occurrence.location}</span>
          </span>
        )}
        {occurrence.templateId && (
          <span className="flex items-center gap-2">
            <IconRepeat size={14} className="shrink-0" />
            Repeats weekly
          </span>
        )}
      </div>

      <StatusAnnouncer message={trash.isError ? "Couldn't move the session to Trash" : null} />
    </div>
  );
}

function SessionEditForm({
  spaceId,
  occurrence,
  onDone,
}: {
  spaceId: string;
  occurrence: SessionOccurrence;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const { entity, templateId } = occurrence;
  const [scope, setScope] = useState<EditScope>("this");
  const [title, setTitle] = useState(entity.title);
  const [date, setDate] = useState(occurrence.date);
  const [startTime, setStartTime] = useState(occurrence.startTime);
  const [endTime, setEndTime] = useState(occurrence.endTime);
  const [location, setLocation] = useState(occurrence.location ?? "");
  const timesValid = Boolean(startTime && endTime) && startTime < endTime;
  const valid = title.trim() !== "" && Boolean(date) && timesValid;

  const save = useMutation({
    mutationFn: async () => {
      const nextLocation = location.trim() || null;
      if (scope === "this" || !templateId) {
        if (title.trim() !== entity.title) await updateEntity(entity.id, { title: title.trim() });
        await overrideOccurrence(entity.id, {
          date,
          startTime,
          endTime,
          location: nextLocation,
        });
      } else {
        // Only what changed, so an unchanged field never flattens other overrides.
        const patch: SeriesPatch = {};
        if (title.trim() !== entity.title) patch.title = title.trim();
        if (startTime !== occurrence.startTime) patch.startTime = startTime;
        if (endTime !== occurrence.endTime) patch.endTime = endTime;
        if (nextLocation !== occurrence.location) patch.location = nextLocation;
        const from = scope === "following" ? occurrence.date : format(new Date(), "yyyy-MM-dd");
        await updateSessionSeries(templateId, from, patch);
      }
      await refreshSessions(queryClient, spaceId, entity.id);
    },
  });
  useCloseAfterSuccess(save, onDone);

  return (
    <form
      className="flex flex-col gap-2 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && !save.isPending) save.mutate();
      }}
    >
      {templateId && (
        // SAFETY: Radix only emits the `SCOPES` trigger values below.
        <Tabs value={scope} onValueChange={(next) => setScope(next as EditScope)}>
          <TabsList size="sm" className="w-full">
            {SCOPES.map((s) => (
              <TabsTrigger key={s.id} value={s.id} size="sm">
                {s.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
      <Input
        aria-label="Title"
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      {scope === "this" && (
        <DateInput
          aria-label="Date"
          clearable={false}
          value={date || null}
          onChange={(day) => setDate(day ?? "")}
        />
      )}
      <div className="flex items-center gap-1.5">
        <Input
          type="time"
          aria-label="Start time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          className="flex-1"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <Input
          type="time"
          aria-label="End time"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          className="flex-1"
        />
      </div>
      <Input
        aria-label="Location"
        placeholder="Location"
        value={location}
        onChange={(e) => setLocation(e.target.value)}
      />
      {scope !== "this" && (
        <p className="text-xs text-muted-foreground">
          {scope === "following"
            ? "Changes this session and every later one in the series."
            : "Changes every session from today on."}{" "}
          Past sessions and changes made to single sessions stay as they are.
        </p>
      )}
      <FieldError
        message={
          (!timesValid && startTime >= endTime && "End after it starts") ||
          (save.isError && save.error.message)
        }
      />
      <div className="flex justify-end gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={!valid}>
          <StatusButtonContent
            status={statusOf(save)}
            label="Save"
            errorLabel="Couldn't save, try again"
          />
        </Button>
      </div>
    </form>
  );
}

/// The Jot typed during this occurrence and the Note that refines it later.
/// Each button creates its page once, then opens it.
function SessionPages({
  spaceId,
  occurrence,
  close,
}: {
  spaceId: string;
  occurrence: SessionOccurrence;
  close: () => void;
}) {
  const { data: pages } = useQuery({
    queryKey: ["session-pages", occurrence.entity.id],
    queryFn: () => getSessionPages(occurrence.entity.id),
  });
  // The next step stands out: first the Jot, then the Note refining it.
  const next = !pages
    ? null
    : !pages.jot && !pages.note
      ? "jot"
      : pages.jot && !pages.note
        ? "note"
        : null;
  return (
    <div className="grid grid-cols-2 gap-2 border-t border-border p-3">
      <SessionPageButton
        kind="jot"
        spaceId={spaceId}
        occurrence={occurrence}
        pageId={pages?.jot?.id}
        primary={next === "jot"}
        loading={!pages}
        close={close}
      />
      <SessionPageButton
        kind="note"
        spaceId={spaceId}
        occurrence={occurrence}
        pageId={pages?.note?.id}
        primary={next === "note"}
        loading={!pages}
        close={close}
      />
    </div>
  );
}

function SessionPageButton({
  kind,
  spaceId,
  occurrence,
  pageId,
  primary,
  loading,
  close,
}: {
  kind: "jot" | "note";
  spaceId: string;
  occurrence: SessionOccurrence;
  pageId: string | undefined;
  /// The page to write next gets the primary style, the rest stay secondary.
  primary: boolean;
  loading: boolean;
  close: () => void;
}) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const Icon = MODULE_ICONS[kind === "jot" ? "jots" : "notes"];
  const noun = kind === "jot" ? "jot" : "note";
  const create = useMutation({
    mutationFn: () =>
      createSessionPage(
        occurrence.entity.id,
        kind,
        `${displayTitle(occurrence.entity)}, ${formatShortDate(occurrence.date)}`,
      ),
    // Straight into the new page: landing there confirms it was created.
    onSuccess: async (page) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["session-pages", occurrence.entity.id] }),
        queryClient.invalidateQueries({ queryKey: ["entities", spaceId] }),
      ]);
      close();
      openEntity(page.id, spaceId);
    },
  });
  const status = statusOf(create);

  if (pageId && !create.isPending) {
    return (
      <Button
        variant="secondary"
        onClick={() => {
          close();
          openEntity(pageId, spaceId);
        }}
      >
        <IconArrowUpRight />
        Open {noun}
      </Button>
    );
  }
  return (
    <Button
      variant={primary ? "default" : "secondary"}
      disabled={loading}
      onClick={() => !create.isPending && create.mutate()}
    >
      <StatusButtonContent
        status={status}
        icon={<Icon />}
        label={`New ${noun}`}
        errorLabel="Try again"
      />
    </Button>
  );
}

function DeleteSeriesDialog({
  spaceId,
  occurrence,
  templateId,
  open,
  onOpenChange,
}: {
  spaceId: string;
  occurrence: SessionOccurrence;
  templateId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions", spaceId],
    queryFn: () => listSessions(spaceId),
    enabled: open,
  });
  const count = sessions.filter(
    (s) => s.templateId === templateId && s.date >= occurrence.date,
  ).length;
  const remove = useMutation({
    mutationFn: () => deleteSessionSeries(templateId, occurrence.date),
    onSuccess: () => refreshSessions(queryClient, spaceId, occurrence.entity.id),
  });
  useCloseAfterSuccess(remove, () => {
    onOpenChange(false);
    remove.reset();
  });
  const status = statusOf(remove);
  const noun = count === 1 ? "session" : "sessions";

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) remove.reset();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex flex-wrap items-center gap-1.5">
            Move {count} {noun} of
            <EntityMention
              icon={<EntityIcon entity={occurrence.entity} size={13} />}
              label={displayTitle(occurrence.entity)}
            />
            to Trash?
          </AlertDialogTitle>
          <AlertDialogDescription>
            The session on {formatShortDate(occurrence.date)} and every later one in the series go
            to Trash. Earlier sessions stay. Restore them from Trash any time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={(e) => {
              e.preventDefault();
              if (status === "idle" || status === "error") remove.mutate();
            }}
          >
            <StatusButtonContent
              status={status}
              label={`Move ${count} to Trash`}
              errorLabel="Couldn't move to Trash, try again"
            />
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
