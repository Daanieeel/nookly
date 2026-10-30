import { type QueryClient, useQuery } from "@tanstack/react-query";
import * as api from "#/lib/api/moodle.ts";
import { qk } from "#/lib/query-keys.ts";

/// Every answer comes from the site when it can be reached and from the last answer
/// otherwise (`offline`). Nothing retries by itself: a refused sign in or a function the
/// site doesn't allow won't change by asking again.
const options = { retry: false, staleTime: 60_000 } as const;

export const useMoodleStatus = () =>
  useQuery({ queryKey: qk.moodle.status, queryFn: api.moodleStatus, staleTime: Infinity });

export const useMoodleCourses = () =>
  useQuery({ queryKey: qk.moodle.courses, queryFn: api.moodleCourses, ...options });

export const useMoodleContents = (courseId: number) =>
  useQuery({
    queryKey: qk.moodle.contents(courseId),
    queryFn: () => api.moodleContents(courseId),
    ...options,
  });

export const useMoodleAssignments = (courseId: number) =>
  useQuery({
    queryKey: qk.moodle.assignments(courseId),
    queryFn: () => api.moodleAssignments(courseId),
    ...options,
  });

export const useMoodleAssignmentStatus = (assignmentId: number) =>
  useQuery({
    queryKey: qk.moodle.assignmentStatus(assignmentId),
    queryFn: () => api.moodleAssignmentStatus(assignmentId),
    ...options,
  });

export const useMoodleGrades = (courseId: number) =>
  useQuery({
    queryKey: qk.moodle.grades(courseId),
    queryFn: () => api.moodleGrades(courseId),
    ...options,
  });

export const useMoodleForums = (courseId: number) =>
  useQuery({
    queryKey: qk.moodle.forums(courseId),
    queryFn: () => api.moodleForums(courseId),
    ...options,
  });

export const useMoodleDiscussions = (forumId: number) =>
  useQuery({
    queryKey: qk.moodle.discussions(forumId),
    queryFn: () => api.moodleDiscussions(forumId),
    ...options,
  });

export const useMoodlePosts = (discussionId: number) =>
  useQuery({
    queryKey: qk.moodle.posts(discussionId),
    queryFn: () => api.moodlePosts(discussionId),
    ...options,
  });

export const useMoodlePageText = (url: string) =>
  useQuery({
    queryKey: qk.moodle.pageText(url),
    queryFn: () => api.moodleFileText(url),
    // The address is only known once the course's contents have loaded.
    enabled: url !== "",
    ...options,
  });

/// Asks Moodle again for everything on screen.
export const refreshMoodle = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({
    queryKey: qk.moodle.root,
    predicate: (query) => query.queryKey[1] !== "status",
  });
