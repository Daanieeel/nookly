import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { Connection, MoodleApi } from "./api.ts";
import { useMoodleService } from "./service.tsx";

/// The phone's Moodle answers. Nothing retries by itself, as on the desktop: a refused
/// sign in or a function the site doesn't allow won't change by asking again.
const options = { retry: false, staleTime: 60_000 } as const;

const MOODLE_KEY = ["moodle"] as const;

export function useMoodleConnection() {
  const { account } = useMoodleService();
  return useQuery({
    queryKey: [...MOODLE_KEY, "connection"],
    queryFn: account.load,
    staleTime: Infinity,
  });
}

/// Forgets every Moodle answer, after signing in or out: another account's must never show.
export function useForgetMoodle() {
  const client = useQueryClient();
  return useCallback(() => client.invalidateQueries({ queryKey: MOODLE_KEY }), [client]);
}

function useMoodle<T>(
  key: (string | number)[],
  fetch: (api: MoodleApi, c: Connection) => Promise<T>,
  enabled = true,
) {
  const { api } = useMoodleService();
  const { data: connection } = useMoodleConnection();
  return useQuery({
    queryKey: [...MOODLE_KEY, connection?.site.root ?? "", ...key],
    queryFn: () => {
      if (!connection) throw new Error("Connect Moodle first.");
      return fetch(api, connection);
    },
    enabled: Boolean(connection) && enabled,
    ...options,
  });
}

export const useMoodleCourses = () => useMoodle(["courses"], (api, c) => api.courses(c));
export const useMoodleContents = (courseId: number) =>
  useMoodle(["contents", courseId], (api, c) => api.contents(c, courseId));
export const useMoodleAssignments = (courseId: number) =>
  useMoodle(["assignments", courseId], (api, c) => api.assignments(c, courseId));
export const useMoodleGrades = (courseId: number) =>
  useMoodle(["grades", courseId], (api, c) => api.grades(c, courseId));
export const useMoodleForums = (courseId: number) =>
  useMoodle(["forums", courseId], (api, c) => api.forums(c, courseId));
export const useMoodleDiscussions = (forumId: number, open: boolean) =>
  useMoodle(["discussions", forumId], (api, c) => api.discussions(c, forumId), open);
export const useMoodlePosts = (discussionId: number) =>
  useMoodle(["posts", discussionId], (api, c) => api.posts(c, discussionId));
