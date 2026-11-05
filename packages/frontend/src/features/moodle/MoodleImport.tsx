import { IconFileImport, IconFolderSearch, IconPlus } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type MouseEvent, useMemo, useState } from "react";
import {
  FieldError,
  StatusButtonContent,
  useActionStatus,
  useCloseAfterSuccess,
} from "#/components/action-feedback.tsx";
import { LabelDot } from "#/components/label-chip.tsx";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nookly/ui/components/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { cn } from "@nookly/ui/lib/utils";
import { listCourses } from "#/lib/api/courses.ts";
import { type MoodleFile, moodleFilePath } from "#/lib/api/moodle.ts";
import { importFileWithDetails, listFiles } from "#/lib/api/files.ts";
import { listLabels } from "#/lib/api/labels.ts";
import type { FileEntity, Label } from "#/lib/api/types.ts";
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

const chipClass = (selected: boolean) =>
  cn(
    "inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border px-2 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring",
    selected
      ? "border-primary/40 bg-accent text-foreground"
      : "border-border text-muted-foreground hover:bg-accent/60 hover:text-foreground",
  );

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
  courses: { id: string; title: string }[];
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
  const [picked, setPicked] = useState(() => {
    const first = suggested[0];
    return new Set(first === undefined ? [] : [keyOf(first, existingFor(first))]);
  });
  const [title, setTitle] = useState(titles[0] ?? file.fileName);
  const [typed, setTyped] = useState("");
  const [courseId, setCourseId] = useState(
    () => (moodleCourse && matchCourse(courses, moodleCourse)?.id) || NO_COURSE,
  );

  const toggle = (key: string) =>
    setPicked((now) => {
      const next = new Set(now);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const addTyped = () => {
    const name = typed.trim();
    if (!name) return;
    const existing = existingFor(name);
    if (!existing && !newNames.some((n) => n.toLowerCase() === name.toLowerCase())) {
      setNewNames((now) => [...now, name]);
    }
    setPicked((now) => new Set(now).add(keyOf(name, existing)));
    setTyped("");
  };

  const importing = useMutation({
    mutationFn: async () =>
      importFileWithDetails(spaceId, await moodleFilePath(file), {
        origin: originOf(file),
        title: title.trim(),
        labelIds: labels.filter((l) => picked.has(keyOf(l.name, l))).map((l) => l.id),
        newLabels: newNames
          .filter((name) => picked.has(keyOf(name)))
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
      className="flex min-w-0 flex-col gap-4"
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
        {titles.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            Or
            {titles
              .filter((t) => t !== title)
              .map((t) => (
                <button
                  key={t}
                  type="button"
                  className={chipClass(false)}
                  onClick={() => setTitle(t)}
                >
                  <span className="truncate">{t}</span>
                </button>
              ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="moodle-import-label">Labels</FieldLabel>
        <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
          {labels.map((label) => (
            <button
              key={label.id}
              type="button"
              aria-pressed={picked.has(keyOf(label.name, label))}
              className={chipClass(picked.has(keyOf(label.name, label)))}
              onClick={() => toggle(keyOf(label.name, label))}
            >
              <LabelDot label={label} />
              <span className="truncate">{label.name}</span>
            </button>
          ))}
          {newNames.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={picked.has(keyOf(name))}
              className={chipClass(picked.has(keyOf(name)))}
              onClick={() => toggle(keyOf(name))}
            >
              <IconPlus size={12} aria-hidden="true" />
              <span className="truncate">{name}</span>
              <span className="text-muted-foreground">New</span>
            </button>
          ))}
        </div>
        <Input
          id="moodle-import-label"
          value={typed}
          placeholder="Add a label"
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            // Enter adds the label; it doesn't import.
            e.preventDefault();
            addTyped();
          }}
        />
      </div>

      {courses.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="moodle-import-course">Attach to a course</FieldLabel>
          <Select value={courseId} onValueChange={setCourseId}>
            <SelectTrigger id="moodle-import-course" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_COURSE}>No course</SelectItem>
              {courses.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

/// A label chip's identity: the Label's id when the Space has it, else its lower cased name.
function keyOf(name: string, existing?: Label): string {
  return existing ? `label:${existing.id}` : `new:${name.toLowerCase()}`;
}
