import { IconPin } from "@tabler/icons-react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { type SortingState, useTable } from "@tanstack/react-table";
import { type ReactNode, useMemo, useState } from "react";
import { entityTarget } from "@/components/context-menu/registry";
import { DataTable } from "@/components/data-table/data-table";
import { EmptyState } from "@/components/empty-state";
import { iconForType } from "@/components/entity-icon";
import { EntityKey } from "@/components/entity-key";
import { moveRowFocus } from "@/components/grouped-view/grouping";
import { SpaceGlyph } from "@/components/spotlight";
import { AssignmentRow } from "@/features/assignments/assignment-views";
import {
  readDisplay as readBookmarkDisplay,
  useSpaceLabels,
} from "@/features/bookmarks/bookmark-model";
import { BookmarkCard, BookmarkRow } from "@/features/bookmarks/BookmarksListView";
import { useCourseLookup } from "@/features/courses/course-lookup";
import { CourseCard } from "@/features/courses/CoursesListView";
import { resolveActiveSemesterId } from "@/features/courses/current-semester";
import { SemesterRow } from "@/features/courses/SemestersListView";
import { ExamTimelineRows } from "@/features/exams/ExamsListView";
import { readDisplay as readFileDisplay } from "@/features/files/file-model";
import { FileRow, FileTile } from "@/features/files/FilesListView";
import { buildColumns, toRow } from "@/features/notes/JotsListView";
import { type NoteRow, noteColumns } from "@/features/notes/NotesListView";
import { notePreviewText } from "@/features/notes/note-preview";
import { EntityRow } from "@/features/relationships/EntityRow";
import { TasksDataContext, useTasksDataValue } from "@/features/tasks/task-controls";
import { DISPLAY_PROPERTIES } from "@/features/tasks/task-model";
import { TaskRow } from "@/features/tasks/TaskList";
import { listAssignments } from "@/lib/api/assignments";
import { listBookmarks } from "@/lib/api/bookmarks";
import { listCourses, listSemesters } from "@/lib/api/courses";
import { listEntities } from "@/lib/api/entities";
import { listExams } from "@/lib/api/exams";
import { listFiles } from "@/lib/api/files";
import { listLabels } from "@/lib/api/labels";
import { listJotSummaries, listNoteSummaries } from "@/lib/api/notes";
import { listRelationships } from "@/lib/api/relationships";
import { listSessions } from "@/lib/api/sessions";
import { listSpaces } from "@/lib/api/spaces";
import { getTask, listTasks } from "@/lib/api/tasks";
import type { Entity, SessionOccurrence, Space } from "@/lib/api/types";
import { formatShortDate } from "@/lib/datetime";
import { displayTitle } from "@/lib/entity-title";
import { TYPE_GROUPS, typeGroupFor } from "@/lib/search-results";
import { useNavStore } from "@/lib/store/nav";
import { dataTableFeatures } from "@/lib/table-features";
import { cn } from "@/lib/utils";

/// Cross-Space Pinned page (§4.2): pinned items grouped by Space, then by module,
/// each drawn exactly the way its own module page draws it (task rows, note table,
/// course cards, file tiles, ...), so a pinned item reads the same everywhere.
export function PinnedView() {
  const { data: entities = [], isPending } = useQuery({
    queryKey: ["entities", "all"],
    queryFn: () => listEntities(null, false),
  });
  const { data: spaces = [] } = useQuery({ queryKey: ["spaces"], queryFn: listSpaces });
  const pinned = entities.filter((e) => e.pinned);
  const bySpace = spaces
    .map((space) => ({ space, items: pinned.filter((e) => e.spaceId === space.id) }))
    .filter((s) => s.items.length > 0);

  return (
    <div className="flex w-full flex-col gap-6">
      <h1 className="flex items-baseline gap-2 text-lg font-semibold">
        Pinned
        {pinned.length > 0 && (
          <span className="text-sm font-normal text-muted-foreground tabular-nums">
            {pinned.length}
          </span>
        )}
      </h1>
      {!isPending && pinned.length === 0 ? (
        <EmptyState
          icon={IconPin}
          title="Nothing pinned yet"
          description="Pin an item from anywhere to keep it one click away."
        />
      ) : (
        bySpace.map(({ space, items }) => (
          <SpaceSection key={space.id} space={space} items={items} />
        ))
      )}
    </div>
  );
}

function SpaceSection({ space, items }: { space: Space; items: Entity[] }) {
  const modules = TYPE_GROUPS.map((g) => ({
    group: g,
    items: items.filter((e) => g.types.includes(e.type)),
  })).filter((m) => m.items.length > 0);
  const other = items.filter((e) => typeGroupFor(e.type).key === "other");
  return (
    <section aria-label={space.name} className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 border-b border-border pb-2 text-sm font-medium">
        <SpaceGlyph space={space} size={15} />
        {space.name}
        <span className="text-muted-foreground tabular-nums">{items.length}</span>
      </h2>
      {modules.map(({ group, items: moduleItems }) => (
        <ModuleGroup
          key={group.key}
          label={group.label}
          type={group.types[0]}
          count={moduleItems.length}
        >
          <ModuleItems moduleKey={group.key} spaceId={space.id} entities={moduleItems} />
        </ModuleGroup>
      ))}
      {other.length > 0 && (
        <ModuleGroup label="Other" type="other" count={other.length}>
          <Fallback entities={other} />
        </ModuleGroup>
      )}
    </section>
  );
}

function ModuleGroup({
  label,
  type,
  count,
  children,
}: {
  label: string;
  type: string;
  count: number;
  children: ReactNode;
}) {
  const Icon = iconForType(type);
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground">
        <Icon size={13} />
        {label}
        <span className="tabular-nums">{count}</span>
      </h3>
      {children}
    </div>
  );
}

function ModuleItems({
  moduleKey,
  spaceId,
  entities,
}: {
  moduleKey: string;
  spaceId: string;
  entities: Entity[];
}) {
  const ids = new Set(entities.map((e) => e.id));
  switch (moduleKey) {
    case "tasks":
      return <PinnedTasks spaceId={spaceId} entities={entities} />;
    case "notes":
      return <PinnedNotes spaceId={spaceId} ids={ids} />;
    case "jots":
      return <PinnedJots spaceId={spaceId} ids={ids} />;
    case "courses":
      return <PinnedCourses spaceId={spaceId} entities={entities} />;
    case "semesters":
      return <PinnedSemesters spaceId={spaceId} ids={ids} />;
    case "sessions":
      return <PinnedSessions spaceId={spaceId} entities={entities} />;
    case "exams":
      return <PinnedExams spaceId={spaceId} ids={ids} />;
    case "assignments":
      return <PinnedAssignments spaceId={spaceId} ids={ids} />;
    case "files":
      return <PinnedFiles spaceId={spaceId} ids={ids} />;
    case "bookmarks":
      return <PinnedBookmarks spaceId={spaceId} ids={ids} />;
    default:
      return <Fallback entities={entities} />;
  }
}

/// The plain entity row, for types without a list page of their own (decks,
/// study blocks) and for anything a module list doesn't return.
function Fallback({ entities }: { entities: Entity[] }) {
  return (
    <div className="flex flex-col">
      {entities.map((e) => (
        <EntityRow key={e.id} entityId={e.id} currentSpaceId={e.spaceId} />
      ))}
    </div>
  );
}

/// The bordered surface list pages draw their rows on.
function RowList({ children }: { children: ReactNode }) {
  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- only forwards arrow keys between the row buttons inside
    <div
      className="overflow-hidden rounded-lg border border-border [&>*:last-child]:border-b-0"
      onKeyDown={moveRowFocus}
    >
      {children}
    </div>
  );
}

function useOpen(spaceId: string) {
  const openEntity = useNavStore((s) => s.openEntity);
  return (entity: Entity) => openEntity(entity.id, spaceId);
}

function PinnedTasks({ spaceId, entities }: { spaceId: string; entities: Entity[] }) {
  const open = useOpen(spaceId);
  const data = useTasksDataValue(spaceId);
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", spaceId],
    queryFn: () => listTasks(spaceId),
  });
  // Sub-tasks aren't in the Space's list, so each one loads like its own page does.
  const subtaskIds = entities.filter((e) => e.type === "sub_task").map((e) => e.id);
  const subtasks = useQueries({
    queries: subtaskIds.map((id) => ({ queryKey: ["task", id], queryFn: () => getTask(id) })),
  });
  const byId = new Map(tasks.map((t) => [t.entity.id, t]));
  for (const q of subtasks) if (q.data) byId.set(q.data.entity.id, q.data);
  const properties = DISPLAY_PROPERTIES.map((p) => p.id);
  return (
    <TasksDataContext.Provider value={data}>
      <RowList>
        {entities.map((e) => {
          const task = byId.get(e.id);
          return task ? (
            <TaskRow
              key={e.id}
              task={task}
              properties={properties}
              highlighted={false}
              onOpen={() => open(task.entity)}
            />
          ) : null;
        })}
      </RowList>
    </TasksDataContext.Provider>
  );
}

function PinnedNotes({ spaceId, ids }: { spaceId: string; ids: Set<string> }) {
  const open = useOpen(spaceId);
  const [sorting, setSorting] = useState<SortingState>([{ id: "edited", desc: true }]);
  const { data: summaries = [] } = useQuery({
    queryKey: ["entities", spaceId, "note-summaries"],
    queryFn: () => listNoteSummaries(spaceId),
  });
  const { data: labels = [] } = useQuery({
    queryKey: ["labels", spaceId],
    queryFn: () => listLabels(spaceId),
  });
  const data = useMemo<NoteRow[]>(() => {
    const labelsById = new Map(labels.map((l) => [l.id, l]));
    return summaries
      .filter((s) => ids.has(s.entity.id))
      .map((summary) => ({
        summary,
        title: displayTitle(summary.entity),
        preview: notePreviewText(summary.preview, summary.entity.title),
        labels: summary.labelIds.flatMap((id) => labelsById.get(id) ?? []),
      }));
  }, [summaries, labels, ids]);
  const table = useTable({
    features: dataTableFeatures,
    columns: noteColumns,
    data,
    getRowId: (row) => row.summary.entity.id,
    state: { sorting },
    onSortingChange: setSorting,
    enableMultiSort: false,
  });
  if (data.length === 0) return null;
  return (
    <DataTable
      table={table}
      onRowClick={(row) => open(row.summary.entity)}
      rowContextTarget={(row) => entityTarget(row.summary.entity)}
    />
  );
}

function PinnedJots({ spaceId, ids }: { spaceId: string; ids: Set<string> }) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const [sorting, setSorting] = useState<SortingState>([{ id: "edited", desc: true }]);
  const { data: summaries = [] } = useQuery({
    queryKey: ["entities", spaceId, "jot-summaries"],
    queryFn: () => listJotSummaries(spaceId),
  });
  const { data: labels = [] } = useQuery({
    queryKey: ["labels", spaceId],
    queryFn: () => listLabels(spaceId),
  });
  const { data: spaces = [] } = useQuery({ queryKey: ["spaces"], queryFn: listSpaces });
  const data = useMemo(() => {
    const labelsById = new Map(labels.map((l) => [l.id, l]));
    return summaries.filter((s) => ids.has(s.entity.id)).map((s) => toRow(s, labelsById));
  }, [summaries, labels, ids]);
  const columns = useMemo(
    () => buildColumns({ spaceId, spaces, queryClient, openEntity }),
    [spaceId, spaces, queryClient, openEntity],
  );
  const table = useTable({
    features: dataTableFeatures,
    columns,
    data,
    getRowId: (row) => row.summary.entity.id,
    state: { sorting },
    onSortingChange: setSorting,
    enableMultiSort: false,
  });
  if (data.length === 0) return null;
  return (
    <DataTable
      table={table}
      onRowClick={(row) => openEntity(row.summary.entity.id, spaceId)}
      rowContextTarget={(row) => entityTarget(row.summary.entity)}
    />
  );
}

function PinnedCourses({ spaceId, entities }: { spaceId: string; entities: Entity[] }) {
  const open = useOpen(spaceId);
  // Same lists the Courses page hands its cards, so the caches are shared.
  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions", spaceId],
    queryFn: () => listSessions(spaceId),
  });
  const { data: exams = [] } = useQuery({
    queryKey: ["exams", spaceId],
    queryFn: () => listExams(spaceId),
  });
  const { data: assignments = [] } = useQuery({
    queryKey: ["assignments", spaceId],
    queryFn: () => listAssignments(spaceId),
  });
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {entities.map((course) => (
        <CourseCard
          key={course.id}
          course={course}
          spaceId={spaceId}
          sessions={sessions}
          exams={exams}
          assignments={assignments}
          onOpen={() => open(course)}
        />
      ))}
    </div>
  );
}

function PinnedSemesters({ spaceId, ids }: { spaceId: string; ids: Set<string> }) {
  const { data: semesters = [] } = useQuery({
    queryKey: ["semesters", spaceId],
    queryFn: () => listSemesters(spaceId),
  });
  const { data: courses = [] } = useQuery({
    queryKey: ["courses", spaceId],
    queryFn: () => listCourses(spaceId),
  });
  const courseRels = useQueries({
    queries: courses.map((course) => ({
      queryKey: ["relationships", course.id],
      queryFn: () => listRelationships(course.id, "both"),
    })),
  });
  const coursesBySemester = new Map<string, Entity[]>();
  courses.forEach((course, i) => {
    const link = (courseRels[i]?.data ?? []).find(
      (r) => r.relationshipType === "course-semester" && r.fromEntityId === course.id,
    );
    if (link)
      coursesBySemester.set(link.toEntityId, [
        ...(coursesBySemester.get(link.toEntityId) ?? []),
        course,
      ]);
  });
  const activeId = resolveActiveSemesterId(semesters);
  // Reordering is the Semesters page's job, so the drag handlers do nothing here.
  const noop = () => {};
  return (
    <div className="flex flex-col gap-1.5">
      {semesters
        .filter((s) => ids.has(s.entity.id))
        .map((semester) => (
          <SemesterRow
            key={semester.entity.id}
            semester={semester}
            active={semester.entity.id === activeId}
            spaceId={spaceId}
            courses={coursesBySemester.get(semester.entity.id) ?? []}
            dragging={false}
            reorderStatus="idle"
            onDragStart={noop}
            onDragEnd={noop}
            onDropOn={noop}
          />
        ))}
    </div>
  );
}

/// Timetable blocks, laid out as a row of cards instead of on the week grid.
function PinnedSessions({ spaceId, entities }: { spaceId: string; entities: Entity[] }) {
  const open = useOpen(spaceId);
  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions", spaceId],
    queryFn: () => listSessions(spaceId),
  });
  const occurrences = new Map<string, SessionOccurrence>();
  for (const s of sessions) if (!occurrences.has(s.entity.id)) occurrences.set(s.entity.id, s);
  const missing = entities.filter((e) => !occurrences.has(e.id));
  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-2">
        {entities.flatMap((e) => {
          const occurrence = occurrences.get(e.id);
          return occurrence
            ? [<SessionCard key={e.id} occurrence={occurrence} onOpen={() => open(e)} />]
            : [];
        })}
      </div>
      {missing.length > 0 && <Fallback entities={missing} />}
    </>
  );
}

function SessionCard({
  occurrence,
  onOpen,
}: {
  occurrence: SessionOccurrence;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex cursor-pointer flex-col items-start rounded-md border px-2 py-1.5 text-left text-xs",
        occurrence.cancelled
          ? "border-border bg-muted text-muted-foreground line-through"
          : "border-primary/30 bg-primary/10 hover:bg-primary/15",
      )}
      {...entityTarget(occurrence.entity, occurrence)}
    >
      <span className="w-full truncate font-medium">{displayTitle(occurrence.entity)}</span>
      <span className="w-full truncate opacity-80">
        {formatShortDate(occurrence.date)} · {occurrence.startTime} to {occurrence.endTime}
        <EntityKey entityKey={occurrence.entity.key} className="ml-1.5 text-current" />
      </span>
    </button>
  );
}

function PinnedExams({ spaceId, ids }: { spaceId: string; ids: Set<string> }) {
  const openEntity = useNavStore((s) => s.openEntity);
  const { data: exams = [] } = useQuery({
    queryKey: ["exams", spaceId],
    queryFn: () => listExams(spaceId),
  });
  const { courseOf } = useCourseLookup(spaceId, "exam-course");
  const pinned = exams.filter((e) => ids.has(e.entity.id));
  if (pinned.length === 0) return null;
  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- only forwards arrow keys between the row buttons inside
    <div className="py-1" onKeyDown={moveRowFocus}>
      <ExamTimelineRows
        exams={pinned}
        courseOf={courseOf}
        onOpen={(exam) => openEntity(exam.entity.id, spaceId)}
      />
    </div>
  );
}

function PinnedAssignments({ spaceId, ids }: { spaceId: string; ids: Set<string> }) {
  const open = useOpen(spaceId);
  const { data: assignments = [] } = useQuery({
    queryKey: ["assignments", spaceId],
    queryFn: () => listAssignments(spaceId),
  });
  const { courseOf } = useCourseLookup(spaceId, "assignment-course");
  const pinned = assignments.filter((a) => ids.has(a.entity.id));
  if (pinned.length === 0) return null;
  return (
    <RowList>
      {pinned.map((a) => (
        <AssignmentRow
          key={a.entity.id}
          assignment={a}
          course={courseOf.get(a.entity.id)}
          onOpen={() => open(a.entity)}
        />
      ))}
    </RowList>
  );
}

function PinnedFiles({ spaceId, ids }: { spaceId: string; ids: Set<string> }) {
  const open = useOpen(spaceId);
  const { data: files = [] } = useQuery({
    queryKey: ["files", spaceId],
    queryFn: () => listFiles(spaceId),
  });
  const pinned = files.filter((f) => ids.has(f.entity.id));
  if (pinned.length === 0) return null;
  // Follows the layout picked on the Files page.
  return readFileDisplay().layout === "grid" ? (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
      {pinned.map((f) => (
        <FileTile key={f.entity.id} file={f} fresh={false} onOpen={() => open(f.entity)} />
      ))}
    </ul>
  ) : (
    <RowList>
      {pinned.map((f) => (
        <FileRow key={f.entity.id} file={f} fresh={false} onOpen={() => open(f.entity)} />
      ))}
    </RowList>
  );
}

function PinnedBookmarks({ spaceId, ids }: { spaceId: string; ids: Set<string> }) {
  const openDetails = useNavStore((s) => s.setBookmarkSheetId);
  const { data: bookmarks = [] } = useQuery({
    queryKey: ["bookmarks", spaceId],
    queryFn: () => listBookmarks(spaceId),
  });
  const labels = useSpaceLabels(spaceId);
  const labelById = new Map(labels.map((l) => [l.id, l]));
  const pinned = bookmarks.filter((b) => ids.has(b.entity.id));
  if (pinned.length === 0) return null;
  const display = readBookmarkDisplay();
  const labelsOf = (labelIds: string[]) => labelIds.flatMap((id) => labelById.get(id) ?? []);
  // Follows the layout and card options picked on the Bookmarks page.
  return display.layout === "grid" ? (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4">
      {pinned.map((b) => (
        <BookmarkCard
          key={b.entity.id}
          bookmark={b}
          labels={labelsOf(b.labelIds)}
          display={display}
          fresh={false}
          onOpenDetails={() => openDetails(b.entity.id)}
        />
      ))}
    </ul>
  ) : (
    <RowList>
      {pinned.map((b) => (
        <BookmarkRow
          key={b.entity.id}
          bookmark={b}
          labels={labelsOf(b.labelIds)}
          showDescription={display.showDescriptions}
          fresh={false}
          onOpenDetails={() => openDetails(b.entity.id)}
        />
      ))}
    </RowList>
  );
}
