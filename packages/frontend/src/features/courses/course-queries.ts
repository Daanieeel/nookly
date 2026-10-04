import { useQueries, useQuery } from "@tanstack/react-query";
import { listAssignments } from "#/lib/api/assignments.ts";
import { listCourses, listSemesters } from "#/lib/api/courses.ts";
import { listExams } from "#/lib/api/exams.ts";
import { listRelationships } from "#/lib/api/relationships.ts";
import { listSessions } from "#/lib/api/sessions.ts";
import type { Entity, Relationship } from "#/lib/api/types.ts";
import { qk } from "#/lib/query-keys.ts";

/// Shared Space wide queries behind the Course and Semester pages, so every
/// page reads the same caches.

export function useSpaceCourses(spaceId: string) {
  return useQuery({ queryKey: qk.courses.bySpace(spaceId), queryFn: () => listCourses(spaceId) });
}

export function useSpaceSemesters(spaceId: string) {
  return useQuery({
    queryKey: qk.semesters.bySpace(spaceId),
    queryFn: () => listSemesters(spaceId),
  });
}

export function useSpaceSessions(spaceId: string) {
  return useQuery({ queryKey: qk.sessions.bySpace(spaceId), queryFn: () => listSessions(spaceId) });
}

export function useSpaceExams(spaceId: string) {
  return useQuery({ queryKey: qk.exams.bySpace(spaceId), queryFn: () => listExams(spaceId) });
}

export function useSpaceAssignments(spaceId: string) {
  return useQuery({
    queryKey: qk.assignments.bySpace(spaceId),
    queryFn: () => listAssignments(spaceId),
  });
}

/// One Course's relationships (both directions).
export function useCourseRelationships(courseId: string) {
  return useQuery({
    queryKey: qk.relationships.of(courseId),
    queryFn: () => listRelationships(courseId, "both"),
  });
}

/// Every Course's relationships, index aligned with `courses`. Same key each
/// `CourseCard` uses, so react-query shares the cache.
export function useCoursesRelationships(courses: Entity[]) {
  return useQueries({
    queries: courses.map((course) => ({
      queryKey: qk.relationships.of(course.id),
      queryFn: () => listRelationships(course.id, "both"),
    })),
  });
}

/// Each Course's Semester id, from the `course-semester` link (at most one).
export function semesterIdsByCourse(
  courses: Entity[],
  relQueries: { data?: Relationship[] }[],
): Map<string, string> {
  const map = new Map<string, string>();
  courses.forEach((course, i) => {
    const link = (relQueries[i]?.data ?? []).find(
      (r) => r.relationshipType === "course-semester" && r.fromEntityId === course.id,
    );
    if (link) map.set(course.id, link.toEntityId);
  });
  return map;
}

/// The ids of things linked course-ward (`session-course`, `exam-course`,
/// `assignment-course`): the thing is `from`, the Course is `to`.
export function idsLinkedToCourse(
  relationships: Relationship[],
  courseId: string,
  relationshipType: string,
): Set<string> {
  return new Set(
    relationships
      .filter((r) => r.relationshipType === relationshipType && r.toEntityId === courseId)
      .map((r) => r.fromEntityId),
  );
}

/// A Course's own Sessions, Exams and Assignments out of the Space wide lists.
export function courseLinkedItems<
  S extends { entity: { id: string } },
  E extends { entity: { id: string } },
  A extends { entity: { id: string } },
>(
  relationships: Relationship[],
  courseId: string,
  lists: { sessions: S[]; exams: E[]; assignments: A[] },
) {
  const sessionIds = idsLinkedToCourse(relationships, courseId, "session-course");
  const examIds = idsLinkedToCourse(relationships, courseId, "exam-course");
  const assignmentIds = idsLinkedToCourse(relationships, courseId, "assignment-course");
  return {
    courseSessions: lists.sessions.filter((s) => sessionIds.has(s.entity.id)),
    courseExams: lists.exams.filter((e) => examIds.has(e.entity.id)),
    courseAssignments: lists.assignments.filter((a) => assignmentIds.has(a.entity.id)),
  };
}
