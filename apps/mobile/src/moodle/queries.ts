import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { type Connection, type Fetched, type MoodleApi, type RemoteFile, fileUrl } from "./api.ts";
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
  fetch: (api: MoodleApi, c: Connection) => Promise<Fetched<T>>,
  enabled = true,
) {
  const { api, account } = useMoodleService();
  const { data: connection } = useMoodleConnection();
  return useQuery({
    queryKey: [...MOODLE_KEY, connection?.site.root ?? "", ...key],
    // The sign in as it is now, not as this screen last saw it: a question still on its way
    // after signing out must not be asked (and kept) under the old one.
    queryFn: async () => {
      const current = await account.load();
      if (!current) throw new Error("Connect Moodle first.");
      return fetch(api, current);
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
export const useMoodleAssignmentStatus = (assignmentId: number) =>
  useMoodle(["assignment-status", assignmentId], (api, c) => api.assignmentStatus(c, assignmentId));
export const useMoodleGrades = (courseId: number) =>
  useMoodle(["grades", courseId], (api, c) => api.grades(c, courseId));
export const useMoodleForums = (courseId: number) =>
  useMoodle(["forums", courseId], (api, c) => api.forums(c, courseId));
export const useMoodleDiscussions = (forumId: number, open = true) =>
  useMoodle(["discussions", forumId], (api, c) => api.discussions(c, forumId), open);
export const useMoodlePosts = (discussionId: number) =>
  useMoodle(["posts", discussionId], (api, c) => api.posts(c, discussionId));
export const useMoodlePage = (url: string) =>
  useMoodle(["page", url], (api, c) => api.pageText(c, url), url !== "");

/// A file from the site on this phone, downloaded the first time it is asked for.
export function useMoodleDownload(file: RemoteFile | null | undefined, enabled = true) {
  const { downloads } = useMoodleService();
  const { data: connection } = useMoodleConnection();
  return useQuery({
    queryKey: [...MOODLE_KEY, "download", file?.fileurl ?? "", file?.timemodified ?? 0],
    queryFn: async () => {
      if (!connection || !file) throw new Error("Connect Moodle first.");
      const signed = fileUrl(connection, file.fileurl);
      if (!signed) throw new Error("That file is not on your Moodle site.");
      return downloads.fetch(file.fileurl, signed, file.filename, file.timemodified);
    },
    enabled: Boolean(connection && file?.fileurl) && enabled,
    retry: false,
    staleTime: Infinity,
  });
}
