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
import { useForm } from "@tanstack/react-form";
import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import {
  FieldError,
  StatusAnnouncer,
  StatusButtonContent,
  StatusIcon,
  statusOf,
  useActionStatus,
  useCloseAfterSuccess,
} from "#/components/action-feedback.tsx";
import { FormField, fieldMessage, hasVisibleErrors } from "#/components/form-field.tsx";
import { EntityIcon } from "#/components/entity-icon.tsx";
import { EntityMention } from "#/components/entity-mention.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@nookly/ui/components/alert-dialog";
import { Badge } from "@nookly/ui/components/badge";
import { Button } from "@nookly/ui/components/button";
import { DateInput } from "#/components/date-input.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@nookly/ui/components/dropdown-menu";
import { TimeInput } from "#/components/time-input.tsx";
import { Input } from "@nookly/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import { Tabs, TabsList, TabsTrigger } from "@nookly/ui/components/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { restoreEntity, softDeleteEntity, updateEntity } from "#/lib/api/entities.ts";
import {
  type SeriesPatch,
  createSessionPage,
  deleteSessionSeries,
  getSessionPages,
  listSessions,
  overrideOccurrence,
  updateSessionSeries,
} from "#/lib/api/sessions.ts";
import type { SessionOccurrence } from "#/lib/api/types.ts";
import { formatClock, formatShortDate, formatWeekday } from "#/lib/datetime.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { MODULE_ICONS } from "#/lib/modules.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { cn } from "@nookly/ui/lib/utils";
import { qk } from "#/lib/query-keys.ts";

/// Which occurrences an edit reaches, as in any calendar. A series edit never
/// rewrites past occurrences or fields an occurrence changed on its own.
type EditScope = "this" | "following" | "upcoming";

const SCOPES = [
  { id: "this", label: "This session" },
  { id: "following", label: "This and following" },
  { id: "upcoming", label: "All upcoming" },
] satisfies { id: EditScope; label: string }[];

const sessionEditSchema = z
  .object({
    title: z.string().trim().min(1, "Give the session a title"),
    date: z.string().min(1, "Pick a date"),
    startTime: z.string().min(1, "Set a start time"),
    endTime: z.string().min(1, "Set an end time"),
    location: z.string(),
  })
  .refine((v) => v.startTime < v.endTime, {
    path: ["endTime"],
    message: "End after it starts",
  });

type SessionEditValues = z.infer<typeof sessionEditSchema>;

/// What a Jot or Note made for one occurrence is called until renamed.
export function sessionPageTitle(occurrence: SessionOccurrence): string {
  const course = occurrence.courseTitle ? `${occurrence.courseTitle} - ` : "";
  return `${course}${displayTitle(occurrence.entity)}, ${formatShortDate(occurrence.date)}`;
}

export function refreshSessions(queryClient: QueryClient, entityId: string) {
  return Promise.all([
    // The root key (not a per Space key) so this also invalidates the
    // cross-Space qk.sessions.all cache the unified Calendar page reads.
    queryClient.invalidateQueries({ queryKey: qk.sessions.root }),
    queryClient.invalidateQueries({ queryKey: qk.entity.byId(entityId) }),
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
            <SessionEditForm occurrence={occurrence} onDone={() => setEditing(false)} />
          ) : (
            <SessionSummary
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

export function SessionSummary({
  occurrence,
  onEdit,
  onDeleteSeries,
  close,
  showTitle = true,
  compact = false,
}: {
  occurrence: SessionOccurrence;
  onEdit: () => void;
  onDeleteSeries: () => void;
  /// Called after the Session went to Trash.
  close: () => void;
  /// False on the Session's own page, whose header already carries the title.
  showTitle?: boolean;
  /// Tighter text, spacing and buttons, for the Session page's narrow sidebar.
  compact?: boolean;
}) {
  const openEntity = useNavStore((s) => s.openEntity);
  const queryClient = useQueryClient();
  const { entity } = occurrence;
  const toggleCancelled = useMutation({
    mutationFn: async () => {
      await overrideOccurrence(entity.id, { cancelled: !occurrence.cancelled });
      await refreshSessions(queryClient, entity.id);
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
      await refreshSessions(queryClient, entity.id);
      // The block is gone from the calendar, so nothing is left on screen to confirm it.
      toast.success("Session moved to Trash", {
        action: {
          label: "Undo",
          onClick: () =>
            void restoreEntity(entity.id).then(() => refreshSessions(queryClient, entity.id)),
        },
      });
    },
  });

  return (
    <div className={cn("flex flex-col gap-2.5 p-3", compact && "gap-2 p-2.5 text-xs")}>
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col">
          {showTitle && (
            <span className="font-semibold wrap-break-word">{displayTitle(entity)}</span>
          )}
          {occurrence.courseTitle && (
            <span className="text-muted-foreground wrap-break-word">{occurrence.courseTitle}</span>
          )}
        </div>
        {occurrence.cancelled && <Badge variant="secondary">Cancelled</Badge>}
        <div
          className={cn(
            "-mt-1 -mr-1 flex shrink-0 items-center",
            compact && "[&_button]:size-6 [&_svg]:size-3.5",
          )}
        >
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
          {showTitle && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="iconSm"
                  aria-label="Open Session"
                  onClick={() => {
                    close();
                    openEntity(entity.id, entity.spaceId);
                  }}
                >
                  <IconArrowUpRight />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open Session</TooltipContent>
            </Tooltip>
          )}
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
          <IconClock size={compact ? 12 : 14} className="mt-0.5 shrink-0" />
          {formatWeekday(occurrence.date)}, {formatShortDate(occurrence.date)},{" "}
          {formatClock(occurrence.startTime)} to {formatClock(occurrence.endTime)}
        </span>
        {occurrence.location && (
          <span className="flex items-start gap-2">
            <IconMapPin size={compact ? 12 : 14} className="mt-0.5 shrink-0" />
            <span className="wrap-break-word">{occurrence.location}</span>
          </span>
        )}
        {occurrence.templateId && (
          <span className="flex items-center gap-2">
            <IconRepeat size={compact ? 12 : 14} className="shrink-0" />
            Repeats weekly
          </span>
        )}
      </div>

      <StatusAnnouncer message={trash.isError ? "Couldn't move the session to Trash" : null} />
    </div>
  );
}

export function SessionEditForm({
  occurrence,
  onDone,
}: {
  occurrence: SessionOccurrence;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const { entity, templateId } = occurrence;
  const [scope, setScope] = useState<EditScope>("this");

  const form = useForm({
    defaultValues: {
      title: entity.title,
      date: occurrence.date,
      startTime: occurrence.startTime,
      endTime: occurrence.endTime,
      location: occurrence.location ?? "",
    } satisfies SessionEditValues,
    validators: { onChange: sessionEditSchema },
    onSubmit: ({ value }) => {
      if (!save.isPending) save.mutate(value);
    },
  });

  const save = useMutation({
    mutationFn: async ({ title, date, startTime, endTime, location }: SessionEditValues) => {
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
      await refreshSessions(queryClient, entity.id);
    },
  });
  useCloseAfterSuccess(save, onDone);

  return (
    <form
      className="flex flex-col gap-2 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
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
      <form.Field name="title">
        {(field) => (
          <FormField
            label="Title"
            required
            htmlFor="session-edit-title"
            error={fieldMessage(field)}
          >
            <Input
              id="session-edit-title"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </FormField>
        )}
      </form.Field>
      <div className="grid grid-cols-2 gap-2">
        {scope === "this" && (
          <form.Field name="date">
            {(field) => (
              <FormField label="Date" required error={fieldMessage(field)} className="col-span-2">
                <DateInput
                  aria-label="Date"
                  clearable={false}
                  value={field.state.value || null}
                  onChange={(day) => field.handleChange(day ?? "")}
                />
              </FormField>
            )}
          </form.Field>
        )}
        <form.Field name="startTime">
          {(field) => (
            <FormField label="Starts" required error={fieldMessage(field)}>
              <TimeInput
                aria-label="Start time"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={field.handleChange}
              />
            </FormField>
          )}
        </form.Field>
        <form.Field name="endTime">
          {(field) => (
            <FormField label="Ends" required error={fieldMessage(field)}>
              <TimeInput
                aria-label="End time"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={field.handleChange}
              />
            </FormField>
          )}
        </form.Field>
        <form.Field name="location">
          {(field) => (
            <FormField label="Location" htmlFor="session-edit-location" className="col-span-2">
              <Input
                id="session-edit-location"
                placeholder="Optional"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </FormField>
          )}
        </form.Field>
      </div>
      {scope !== "this" && (
        <p className="text-xs text-muted-foreground">
          {scope === "following"
            ? "Changes this session and every later one in the series."
            : "Changes every session from today on."}{" "}
          Past sessions and changes made to single sessions stay as they are.
        </p>
      )}
      <FieldError message={save.isError && save.error.message} />
      <div className="flex justify-end gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <form.Subscribe selector={hasVisibleErrors}>
          {(blocked) => (
            <Button type="submit" size="sm" disabled={blocked}>
              <StatusButtonContent
                status={statusOf(save)}
                label="Save"
                errorLabel="Couldn't save, try again"
              />
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
}

/// The Jot typed during this occurrence and the Note that refines it later.
/// Each button creates its page once, then opens it.
export function SessionPages({
  spaceId,
  occurrence,
  close,
  compact = false,
}: {
  spaceId: string;
  occurrence: SessionOccurrence;
  close: () => void;
  /// Smaller buttons and spacing, for the Session page's narrow sidebar.
  compact?: boolean;
}) {
  const { data: pages } = useQuery({
    queryKey: qk.sessions.pages(occurrence.entity.id),
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
    <div
      className={cn(
        "grid grid-cols-2 gap-2 border-t border-border p-3",
        compact && "gap-1.5 p-2.5",
      )}
    >
      <SessionPageButton
        kind="jot"
        spaceId={spaceId}
        occurrence={occurrence}
        pageId={pages?.jot?.id}
        primary={next === "jot"}
        loading={!pages}
        close={close}
        compact={compact}
      />
      <SessionPageButton
        kind="note"
        spaceId={spaceId}
        occurrence={occurrence}
        pageId={pages?.note?.id}
        primary={next === "note"}
        loading={!pages}
        close={close}
        compact={compact}
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
  compact,
}: {
  kind: "jot" | "note";
  spaceId: string;
  occurrence: SessionOccurrence;
  pageId: string | undefined;
  /// The page to write next gets the primary style, the rest stay secondary.
  primary: boolean;
  loading: boolean;
  close: () => void;
  compact: boolean;
}) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const size = compact ? "sm" : "default";
  const Icon = MODULE_ICONS[kind === "jot" ? "jots" : "notes"];
  const noun = kind === "jot" ? "jot" : "note";
  const create = useMutation({
    mutationFn: () => createSessionPage(occurrence.entity.id, kind, sessionPageTitle(occurrence)),
    // Straight into the new page: landing there confirms it was created.
    onSuccess: async (page) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.sessions.pages(occurrence.entity.id) }),
        queryClient.invalidateQueries({ queryKey: qk.entities.bySpace(spaceId) }),
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
        size={size}
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
      size={size}
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

export function DeleteSeriesDialog({
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
    queryKey: qk.sessions.bySpace(spaceId),
    queryFn: () => listSessions(spaceId),
    enabled: open,
  });
  const count = sessions.filter(
    (s) => s.templateId === templateId && s.date >= occurrence.date,
  ).length;
  const remove = useMutation({
    mutationFn: () => deleteSessionSeries(templateId, occurrence.date),
    onSuccess: () => refreshSessions(queryClient, occurrence.entity.id),
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
