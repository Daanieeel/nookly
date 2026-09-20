import { IconArrowRight, IconCalendarStats, IconPlus, IconSchool } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { EntityPickerPopover } from "@/components/entity-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getEntity } from "@/lib/api/entities";
import {
  createCourse,
  createSemester,
  linkCourseToSemester,
  listCourses,
  listSemesters,
} from "@/lib/api/courses";
import { listRelationships } from "@/lib/api/relationships";
import type { Entity } from "@/lib/api/types";
import { useNavStore } from "@/lib/store/nav";

/// Card-grid identity (name, semester chips, sequel/prequel indicators) rather than
/// a bare table (§2.3) — a Course's relationships (semester, sequel-of/prequel-of)
/// all come from the generic relationship system (§5.4), not dedicated fields.
export function CoursesListView({ spaceId }: { spaceId: string }) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const [createOpen, setCreateOpen] = useState(false);
  const [semesterTitle, setSemesterTitle] = useState("");

  const { data: courses = [] } = useQuery({
    queryKey: ["courses", spaceId],
    queryFn: () => listCourses(spaceId),
  });
  const { data: semesters = [] } = useQuery({
    queryKey: ["semesters", spaceId],
    queryFn: () => listSemesters(spaceId),
  });

  const createSemesterMut = useMutation({
    mutationFn: (t: string) => createSemester(spaceId, t),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["semesters", spaceId] });
      setSemesterTitle("");
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Courses</h1>
          <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <IconPlus size={14} /> New course
          </Button>
        </div>

        {courses.length === 0 ? (
          <EmptyState
            icon={IconSchool}
            title="No courses yet"
            description="Add a course to start tracking its assignments and materials."
            action={{ label: "New course", onClick: () => setCreateOpen(true) }}
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                spaceId={spaceId}
                onOpen={() => openEntity(course.id, spaceId)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xs font-medium text-muted-foreground">Semesters</h2>
        <div className="flex flex-wrap items-center gap-2">
          {semesters.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => openEntity(s.id, spaceId)}
              className="flex items-center gap-1.5 rounded-full border border-border bg-accent px-3 py-1 text-xs hover:bg-accent/80"
            >
              <IconCalendarStats size={12} className="text-muted-foreground" />
              {s.title}
            </button>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (semesterTitle.trim()) createSemesterMut.mutate(semesterTitle.trim());
            }}
            className="flex items-center gap-1.5"
          >
            <Input
              placeholder="e.g. WS 2026/27"
              value={semesterTitle}
              onChange={(e) => setSemesterTitle(e.target.value)}
              className="h-7 w-36 text-xs"
            />
            <Button type="submit" size="sm" variant="outline" disabled={!semesterTitle.trim()}>
              Add
            </Button>
          </form>
        </div>
      </div>

      <CreateCourseDialog open={createOpen} onOpenChange={setCreateOpen} spaceId={spaceId} />
    </div>
  );
}

function CourseCard({
  course,
  spaceId,
  onOpen,
}: {
  course: Entity;
  spaceId: string;
  onOpen: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: relationships = [] } = useQuery({
    queryKey: ["relationships", course.id],
    queryFn: () => listRelationships(course.id, "both"),
  });

  const semesterLinks = relationships.filter(
    (r) => r.relationshipType === "course-semester" && r.fromEntityId === course.id,
  );
  const sequelLinks = relationships.filter(
    (r) => r.relationshipType === "sequel-of" || r.relationshipType === "prequel-of",
  );

  const linkSemester = useMutation({
    mutationFn: (semesterId: string) => linkCourseToSemester(course.id, semesterId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["relationships", course.id] }),
  });

  return (
    <div className="group flex flex-col gap-2 rounded-lg border border-border bg-card p-3 transition-colors hover:border-foreground/20">
      <button type="button" onClick={onOpen} className="flex items-start gap-2 text-left">
        <IconSchool size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium group-hover:underline">
          {course.title}
        </span>
      </button>

      {(semesterLinks.length > 0 || sequelLinks.length > 0) && (
        <div className="flex flex-wrap gap-1">
          {semesterLinks.map((r) => (
            <RelatedChip
              key={r.id}
              entityId={r.toEntityId}
              icon={<IconCalendarStats size={11} />}
            />
          ))}
          {sequelLinks.map((r) => {
            const isFrom = r.fromEntityId === course.id;
            const otherId = isFrom ? r.toEntityId : r.fromEntityId;
            const label = isFrom ? "sequel of" : "prequel of";
            return (
              <RelatedChip
                key={r.id}
                entityId={otherId}
                icon={<IconArrowRight size={11} />}
                prefix={label}
              />
            );
          })}
        </div>
      )}

      <div className="opacity-0 transition-opacity group-hover:opacity-100">
        <EntityPickerPopover
          spaceId={spaceId}
          typeFilter="semester"
          exclude={course.id}
          trigger={
            <button
              type="button"
              className="flex items-center gap-1 rounded-sm px-1 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <IconPlus size={11} /> Link semester
            </button>
          }
          onSelect={(semester) => linkSemester.mutate(semester.id)}
        />
      </div>
    </div>
  );
}

function RelatedChip({
  entityId,
  icon,
  prefix,
}: {
  entityId: string;
  icon: React.ReactNode;
  prefix?: string;
}) {
  const { data: entity } = useQuery({
    queryKey: ["entity", entityId],
    queryFn: () => getEntity(entityId),
  });
  if (!entity) return null;
  return (
    <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      {icon}
      <span className="truncate">
        {prefix ? `${prefix} ` : ""}
        {entity.title}
      </span>
    </span>
  );
}

function CreateCourseDialog({
  open,
  onOpenChange,
  spaceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
}) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else setTitle("");
  }, [open]);

  const create = useMutation({
    mutationFn: () => createCourse(spaceId, title.trim()),
    onSuccess: (entity) => {
      queryClient.invalidateQueries({ queryKey: ["courses", spaceId] });
      queryClient.invalidateQueries({ queryKey: ["entities", spaceId] });
      onOpenChange(false);
      openEntity(entity.id, spaceId);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New course</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) create.mutate();
          }}
        >
          <Input
            ref={inputRef}
            placeholder="Course name"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </form>
        <DialogFooter>
          <Button disabled={!title.trim() || create.isPending} onClick={() => create.mutate()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
