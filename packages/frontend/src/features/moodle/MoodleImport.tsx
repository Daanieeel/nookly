import {
  IconChevronDown,
  IconFileImport,
  IconFolderSearch,
  IconPlus,
  IconTag,
  IconX,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type MouseEvent, type ReactNode, useId, useMemo, useState } from "react";
import {
  FieldError,
  StatusButtonContent,
  useActionStatus,
  useCloseAfterSuccess,
} from "#/components/action-feedback.tsx";
import { EntityPickerPopover, EntityPickerValue } from "#/components/entity-picker.tsx";
import { LabelChip } from "#/components/label-chip.tsx";
import { labelColorFor } from "#/components/label-manager.tsx";
import { Button } from "@nookly/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nookly/ui/components/dialog";
import { FieldLabel } from "@nookly/ui/components/field-label";
import { Input } from "@nookly/ui/components/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";
import { LabelsPicker } from "#/features/tasks/task-properties.tsx";
import { listCourses } from "#/lib/api/courses.ts";
import { type MoodleFile, moodleFilePath } from "#/lib/api/moodle.ts";
import { importFileWithDetails, listFiles } from "#/lib/api/files.ts";
import { listLabels } from "#/lib/api/labels.ts";
import type { Entity, FileEntity, Label } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { qk } from "#/lib/query-keys.ts";
import { armNewTabIntent, useNavStore } from "#/lib/store/nav.ts";
import { fileFacts } from "./moodle-format.ts";
import { fileLook } from "./moodle-icons.tsx";
import { matchCourse, originOf, suggestLabelNames, suggestTitles } from "./moodle-import.ts";
import { messageOf } from "./moodle-login.ts";
import { useMoodleCourse } from "./moodle-queries.ts";

/// Where a file sits in the course, to suggest a name, labels and a course for it.
export interface ImportContext {
  courseId: number;
  /// The section of the course it is in.
  sectionName?: string;
  /// The item it belongs to. Only when the file is that item, not one of several in it.
  itemName?: string;
}

/// The Files of the Space that came from Moodle, by where on the site they came from. A File
/// in the trash is not in it: it no longer is in Nookly.
function useImportedFiles(spaceId: string | undefined): Map<string, FileEntity> {
  const { data } = useQuery({
    queryKey: qk.files.bySpace(spaceId ?? ""),
    queryFn: () => listFiles(spaceId ?? ""),
    enabled: spaceId !== undefined,
  });
  return useMemo(
    () => new Map((data ?? []).flatMap((f) => (f.origin ? [[f.origin, f] as const] : []))),
    [data],
  );
}

/// Putting a file of the course into a Space of Nookly as a File of its own, through the
/// dialog that names and labels it first. Once it is in, `existing` is that File. Links are
/// not files and are left out.
export function useImportFile(
  file: MoodleFile,
  spaceId: string | undefined,
  context: ImportContext,
) {
  const imported = useImportedFiles(spaceId);
  const [open, setOpen] = useState(false);
  return {
    file,
    spaceId,
    context,
    open,
    setOpen,
    existing: imported.get(originOf(file)),
    available: spaceId !== undefined && file.kind !== "url",
  };
}
export type ImportState = ReturnType<typeof useImportFile>;

function useShowInNookly({ existing, spaceId }: ImportState) {
  const openEntity = useNavStore((s) => s.openEntity);
  return (event: MouseEvent) => {
    if (!existing || spaceId === undefined) return;
    // A Cmd or Ctrl click opens a tab in the background, like every other link in the app.
    if (event.metaKey || event.ctrlKey) armNewTabIntent();
    openEntity(existing.entity.id, spaceId);
  };
}

/// The icon button of a file: "Show in Nookly" when it was imported, the way to import it when
/// it wasn't.
export function ImportFileButton({ state }: { state: ImportState }) {
  const show = useShowInNookly(state);
  if (!state.available) return null;
  const label = state.existing ? "Show in Nookly" : "Import into Nookly";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="iconSm"
          aria-label={label}
          onClick={state.existing ? show : () => state.setOpen(true)}
        >
          {state.existing ? <IconFolderSearch size={14} /> : <IconFileImport size={14} />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/// The same as a labelled button, for a place with room for words.
export function ImportFileAction({ state }: { state: ImportState }) {
  const show = useShowInNookly(state);
  if (!state.available) return null;
  return (
    <Button
      variant="secondary"
      size="sm"
      className="w-full justify-start"
      onClick={state.existing ? show : () => state.setOpen(true)}
    >
      {state.existing ? <IconFolderSearch /> : <IconFileImport />}
      {state.existing ? "Show in Nookly" : "Import into Nookly"}
    </Button>
  );
}

/// The dialog an import goes through. Mount it once beside the buttons that open it.
export function ImportFileDialog({ state }: { state: ImportState }) {
  const { spaceId, open, setOpen } = state;
  if (!state.available || spaceId === undefined) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* One column that can shrink: a long file name truncates, it doesn't stretch the dialog. */}
      <DialogContent className="max-w-lg grid-cols-[minmax(0,1fr)]">
        <DialogHeader>
          <DialogTitle>Import into Nookly</DialogTitle>
          <DialogDescription>
            Name and label this file before it goes into your Space.
          </DialogDescription>
        </DialogHeader>
        <ImportForm state={state} spaceId={spaceId} close={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

/// What the form needs from the Space before it can suggest anything.
function ImportForm({
  state,
  spaceId,
  close,
}: {
  state: ImportState;
  spaceId: string;
  close: () => void;
}) {
  const labels = useQuery({
    queryKey: qk.labels.bySpace(spaceId),
    queryFn: () => listLabels(spaceId),
  });
  const courses = useQuery({
    queryKey: qk.courses.bySpace(spaceId),
    queryFn: () => listCourses(spaceId),
  });
  const moodleCourse = useMoodleCourse(state.context.courseId).data;
  if (labels.isPending || courses.isPending) {
    return (
      <output
        aria-label="Getting ready to import"
        className="block h-40 animate-pulse rounded-lg bg-muted/40"
      />
    );
  }
  return (
    <ImportFields
      state={state}
      spaceId={spaceId}
      close={close}
      labels={labels.data ?? []}
      courses={courses.data ?? []}
      moodleCourse={moodleCourse}
    />
  );
}

const NO_COURSE = "none";

/// A quiet pill button, for the suggestions under a field.
const SUGGESTION_CLASS =
  "inline-flex h-6 max-w-full items-center gap-1.5 rounded-md border border-border px-2 text-xs text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";

/// A caption and its row of suggestions, named as a group for assistive tech.
function Suggestions({ caption, children }: { caption: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span id={id} className="text-xs text-muted-foreground">
        {caption}
      </span>
      {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a fieldset cannot sit in the caption row as `display: contents` */}
      <div role="group" aria-labelledby={id} className="contents">
        {children}
      </div>
    </div>
  );
}

/// A label the Space doesn't have yet, shaped like one so the picker lists it beside the rest.
/// It is only created when the import goes through.
function draftLabel(name: string, spaceId: string): Label {
  return {
    id: keyOf(name),
    spaceId,
    name,
    color: labelColorFor(name),
    createdAt: "",
    usageCount: 0,
  };
}

function ImportFields({
  state,
  spaceId,
  close,
  labels,
  courses,
  moodleCourse,
}: {
  state: ImportState;
  spaceId: string;
  close: () => void;
  labels: Label[];
  courses: Entity[];
  moodleCourse: { shortName: string; fullName: string } | undefined;
}) {
  const { file, context } = state;
  const queryClient = useQueryClient();
  const titles = suggestTitles(file, context.itemName);
  const suggested = suggestLabelNames(
    moodleCourse ?? { shortName: "", fullName: "" },
    context.sectionName,
  );
  const existingFor = (name: string) =>
    labels.find((l) => l.name.toLowerCase() === name.toLowerCase());

  // Labels the Space doesn't have yet that are on offer: suggested ones, and the ones typed.
  const [newNames, setNewNames] = useState(() =>
    suggested.filter((name) => existingFor(name) === undefined),
  );
  // The course label starts picked; the rest is one click.
  const [picked, setPicked] = useState<string[]>(() => {
    const first = suggested[0];
    return first === undefined ? [] : [keyOf(first, existingFor(first))];
  });
  const [title, setTitle] = useState(titles[0] ?? file.fileName);
  const [courseId, setCourseId] = useState(
    () => (moodleCourse && matchCourse(courses, moodleCourse)?.id) || NO_COURSE,
  );
  const course = courses.find((c) => c.id === courseId);
  const labelsId = useId();

  const everyLabel = [...labels, ...newNames.map((name) => draftLabel(name, spaceId))];
  const chosen = everyLabel.filter((l) => picked.includes(l.id));
  const toggle = (id: string) =>
    setPicked((now) => (now.includes(id) ? now.filter((p) => p !== id) : [...now, id]));
  const add = (name: string) => {
    const existing = existingFor(name);
    if (!existing && !newNames.some((n) => n.toLowerCase() === name.toLowerCase())) {
      setNewNames((now) => [...now, name]);
    }
    const id = keyOf(name, existing);
    setPicked((now) => (now.includes(id) ? now : [...now, id]));
  };
  const offered = suggested.filter((name) => !picked.includes(keyOf(name, existingFor(name))));
  const otherTitles = titles.filter((t) => t !== title);

  const importing = useMutation({
    mutationFn: async () =>
      importFileWithDetails(spaceId, await moodleFilePath(file), {
        origin: originOf(file),
        title: title.trim(),
        labelIds: labels.filter((l) => picked.includes(l.id)).map((l) => l.id),
        newLabels: newNames
          .filter((name) => picked.includes(keyOf(name)))
          .map((name) => ({ name, color: labelColorFor(name) })),
        attachTo: courseId === NO_COURSE ? [] : [courseId],
      }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.files.bySpace(spaceId) }),
        queryClient.invalidateQueries({
          queryKey: qk.entities.bySpace(spaceId),
        }),
        queryClient.invalidateQueries({ queryKey: qk.labels.root }),
        queryClient.invalidateQueries({
          queryKey: qk.relationships.of(courseId),
        }),
      ]),
  });
  const status = useActionStatus(importing);
  useCloseAfterSuccess(importing, close);

  const look = fileLook(file.kind, file.fileName);
  const Glyph = look.icon;
  const blank = title.trim() === "";
  return (
    <form
      className="flex min-w-0 flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!blank && !importing.isPending && !importing.isSuccess) importing.mutate();
      }}
    >
      <div className="flex min-w-0 items-center gap-3 rounded-xl bg-muted/40 p-2">
        <span
          aria-hidden="true"
          className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", look.tone)}
        >
          <Glyph size={20} />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-medium">{file.fileName}</span>
          <span className="truncate text-xs text-muted-foreground">
            {fileFacts(file, file.fileName).join(" · ")}
          </span>
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="moodle-import-name">Name</FieldLabel>
        <Input id="moodle-import-name" value={title} onChange={(e) => setTitle(e.target.value)} />
        {otherTitles.length > 0 && (
          <Suggestions caption="Suggested names">
            {otherTitles.map((t) => (
              <button
                key={t}
                type="button"
                className={SUGGESTION_CLASS}
                onClick={() => setTitle(t)}
              >
                <span className="truncate">{t}</span>
              </button>
            ))}
          </Suggestions>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel id={`${labelsId}-caption`} htmlFor={labelsId}>
          Labels
        </FieldLabel>
        <LabelsPicker labels={everyLabel} selected={picked} onToggle={toggle} onCreate={add}>
          <button
            id={labelsId}
            type="button"
            aria-label={
              chosen.length > 0 ? `Labels: ${chosen.map((l) => l.name).join(", ")}` : "Labels"
            }
            className="flex min-h-8 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-accent px-3 py-1 text-left text-sm shadow-xs transition-colors outline-none hover:bg-accent/80 focus-visible:ring-2 focus-visible:ring-ring"
          >
            {chosen.length > 0 ? (
              chosen.map((label) => <LabelChip key={label.id} label={label} />)
            ) : (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <IconTag size={14} aria-hidden="true" />
                Add labels
              </span>
            )}
          </button>
        </LabelsPicker>
        {offered.length > 0 && (
          <Suggestions caption="Suggested labels">
            {offered.map((name) => (
              <button
                key={name}
                type="button"
                className={SUGGESTION_CLASS}
                onClick={() => add(name)}
              >
                <IconPlus size={12} aria-hidden="true" />
                <span className="truncate">{name}</span>
              </button>
            ))}
          </Suggestions>
        )}
      </div>

      {courses.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="moodle-import-course">Attach to a course</FieldLabel>
          <EntityPickerPopover
            spaceId={spaceId}
            typeFilter="course"
            onSelect={(course) => setCourseId(course.id)}
            header={(closePicker) =>
              course && (
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center gap-2 border-b border-border px-3 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={() => {
                    setCourseId(NO_COURSE);
                    closePicker();
                  }}
                >
                  <IconX size={14} aria-hidden="true" />
                  No course
                </button>
              )
            }
            trigger={
              <button
                id="moodle-import-course"
                type="button"
                aria-label={`Attach to a course: ${course ? displayTitle(course) : "No course"}`}
                className="flex h-8 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-accent px-3 py-1 text-sm shadow-xs transition-colors outline-none hover:bg-accent/80 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <EntityPickerValue entity={course ?? null} placeholder="No course" />
                <IconChevronDown
                  size={14}
                  aria-hidden="true"
                  className="ml-auto shrink-0 text-muted-foreground"
                />
              </button>
            }
          />
        </div>
      )}

      <FieldError message={importing.isError && messageOf(importing.error)} />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={blank || importing.isPending}>
          <StatusButtonContent
            status={status}
            icon={<IconFileImport />}
            label="Import"
            successLabel="Imported"
            errorLabel="Couldn't import, try again"
          />
        </Button>
      </DialogFooter>
    </form>
  );
}

/// A label's identity in the form: its id when the Space has it, else its lower cased name.
function keyOf(name: string, existing?: Label): string {
  return existing ? existing.id : `new:${name.toLowerCase()}`;
}
