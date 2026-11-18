import type { ComponentType, ReactNode } from "react";
import type {
  AnswerCache,
  Http,
  MoodleAssignment,
  MoodleCourse,
  MoodleDiscussion,
  MoodleForum,
  MoodleGradeItem,
  MoodleModule as Module,
  MoodleSection,
  RemoteFile,
} from "../moodle/api.ts";
import type { CalendarStore } from "../moodle/calendar.ts";
import type { MoodleDownloads } from "../moodle/device.ts";
import { MoodleProvider, moodleService } from "../moodle/service.tsx";

export const SITE = "https://moodle.uni.edu";

export const CONNECTION = {
  site: { root: SITE },
  token: "abc123",
  userId: 7,
  siteName: "Uni Moodle",
  fullName: "Ada Lovelace",
};

type Files = Partial<RemoteFile>[];

/// What the sign in sheet was opened on, and what it gives back.
interface SignInSheet {
  opened: string[];
  answer: string | null;
}

/// What Moodle answers when it refuses.
interface MoodleFailure {
  exception: string;
  errorcode: string;
  message: string;
}

/// What the fake site answers, by function: Moodle's own shapes, with fields left out.
export interface MoodleAnswers {
  core_enrol_get_users_courses?:
    | (Partial<Omit<MoodleCourse, "overviewfiles">> & { overviewfiles?: Files })[]
    | MoodleFailure;
  core_course_get_contents?: (Partial<Omit<MoodleSection, "modules">> & {
    modules: (Partial<Omit<Module, "contents">> & { contents?: Files })[];
  })[];
  mod_assign_get_assignments?: {
    courses: {
      assignments: (Partial<Omit<MoodleAssignment, "introattachments">> & {
        introattachments?: Files;
      })[];
    }[];
  };
  mod_assign_get_submission_status?: object;
  gradereport_user_get_grade_items?: { usergrades: { gradeitems: Partial<MoodleGradeItem>[] }[] };
  mod_forum_get_forums_by_courses?: Partial<MoodleForum>[];
  mod_forum_get_forum_discussions?: {
    discussions: (Partial<Omit<MoodleDiscussion, "attachments">> & { attachments?: Files })[];
  };
  mod_forum_get_discussion_posts?: object;
}

/// A Moodle site that answers each function with what a test gives it (and its pages by
/// address), a keychain and a cache in memory, downloads that only record what was fetched,
/// and a browser that only records what it was asked to open. `online = false` takes the
/// site out of reach.
export function fakeMoodle(answers: MoodleAnswers = {}, pages: Record<string, string> = {}) {
  const byFunction = new Map<string, object>(Object.entries(answers));
  const keys = new Map<string, string>();
  const kept = new Map<string, string>();
  const opened: string[] = [];
  /// What the sign in sheet was opened on, and the link Moodle sends back in it (null: the
  /// person closed it).
  const sheet: SignInSheet = { opened: [], answer: null };
  const downloaded: string[] = [];
  const state = { online: true };
  const http: Http = async (url, init) => {
    if (!state.online) throw new TypeError("Network request failed");
    if (init.method === "GET") {
      const page = pages[url.split("?")[0] ?? ""];
      return {
        ok: page !== undefined,
        status: page === undefined ? 404 : 200,
        text: async () => page ?? "",
      };
    }
    const fn = new URLSearchParams(init.body).get("wsfunction") ?? "";
    return { ok: true, status: 200, text: async () => JSON.stringify(byFunction.get(fn) ?? []) };
  };
  const cache: AnswerCache = {
    get: async (key) => kept.get(key) ?? null,
    set: async (key, body) => void kept.set(key, body),
    clear: async () => kept.clear(),
  };
  const calendarKept = new Map<string, string>();
  const calendarStore: CalendarStore = {
    read: async () => calendarKept.get("feed") ?? null,
    write: async (body) => void calendarKept.set("feed", body),
    clear: async () => void calendarKept.delete("feed"),
  };
  const local = new Map<string, string>();
  const downloads: MoodleDownloads = {
    local: (url) => local.get(url) ?? null,
    fetch: async (url, signed, name) => {
      downloaded.push(signed);
      const uri = `file:///moodle-files/${name}`;
      local.set(url, uri);
      return uri;
    },
  };
  const service = moodleService({
    http,
    keys: {
      getItemAsync: async (key) => keys.get(key) ?? null,
      setItemAsync: async (key, value) => void keys.set(key, value),
      deleteItemAsync: async (key) => void keys.delete(key),
    },
    cache,
    downloads,
    calendarStore,
    store: async (uri) => {
      const name = uri.split("/").pop() ?? "file";
      return { name, uri: `file:///files/${name}` };
    },
    md5: async () => "",
    uuid: () => "11111111-2222-3333-4444-555555555555",
    open: async (url) => void opened.push(url),
    signIn: async (url) => {
      sheet.opened.push(url);
      return sheet.answer;
    },
  });
  const wrap = (node: ReactNode) => () => <MoodleProvider service={service}>{node}</MoodleProvider>;
  const routes = (screens: Record<string, ComponentType>) =>
    Object.fromEntries(Object.entries(screens).map(([path, Screen]) => [path, wrap(<Screen />)]));
  return { keys, kept, opened, sheet, downloaded, state, wrap, routes };
}

export const connected = (answers: MoodleAnswers = {}, pages: Record<string, string> = {}) => {
  const moodle = fakeMoodle(answers, pages);
  moodle.keys.set("moodle.connection", JSON.stringify(CONNECTION));
  return moodle;
};
