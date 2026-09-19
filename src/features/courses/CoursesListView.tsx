import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { EntityIcon } from "@/components/entity-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCourse, createSemester, listCourses, listSemesters } from "@/lib/api/courses";
import { useNavStore } from "@/lib/store/nav";

export function CoursesListView({ spaceId }: { spaceId: string }) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const [courseTitle, setCourseTitle] = useState("");
  const [semesterTitle, setSemesterTitle] = useState("");

  const { data: courses = [] } = useQuery({
    queryKey: ["courses", spaceId],
    queryFn: () => listCourses(spaceId),
  });
  const { data: semesters = [] } = useQuery({
    queryKey: ["semesters", spaceId],
    queryFn: () => listSemesters(spaceId),
  });

  const createCourseMut = useMutation({
    mutationFn: (t: string) => createCourse(spaceId, t),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses", spaceId] });
      setCourseTitle("");
    },
  });
  const createSemesterMut = useMutation({
    mutationFn: (t: string) => createSemester(spaceId, t),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["semesters", spaceId] });
      setSemesterTitle("");
    },
  });

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold">Courses</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (courseTitle.trim()) createCourseMut.mutate(courseTitle.trim());
          }}
          className="flex gap-2"
        >
          <Input
            placeholder="New course…"
            value={courseTitle}
            onChange={(e) => setCourseTitle(e.target.value)}
            className="h-9"
          />
          <Button type="submit" size="sm" disabled={!courseTitle.trim()}>
            Add
          </Button>
        </form>
        <div className="flex flex-col">
          {courses.map((course) => (
            <button
              key={course.id}
              type="button"
              onClick={() => openEntity(course.id, spaceId)}
              className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <EntityIcon entity={course} className="shrink-0 text-muted-foreground" />
              <span className="truncate">{course.title}</span>
            </button>
          ))}
          {courses.length === 0 && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">No courses yet.</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xs font-medium text-muted-foreground">Semesters</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (semesterTitle.trim()) createSemesterMut.mutate(semesterTitle.trim());
          }}
          className="flex gap-2"
        >
          <Input
            placeholder="e.g. WS 2026/27"
            value={semesterTitle}
            onChange={(e) => setSemesterTitle(e.target.value)}
            className="h-9"
          />
          <Button type="submit" size="sm">
            Add
          </Button>
        </form>
        <div className="flex flex-wrap gap-2">
          {semesters.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => openEntity(s.id, spaceId)}
              className="rounded-full border border-border px-3 py-1 text-xs hover:bg-accent"
            >
              {s.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
