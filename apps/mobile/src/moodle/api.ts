import { z } from "zod";
import { pageOf, type Site } from "./login.ts";

/// Moodle's web services, as the desktop calls them (`moodle/api.rs`, `moodle/service.rs`,
/// `moodle/model.rs`): one form posted to `webservice/rest/server.php` per function, the
/// answer read through a schema so a missing field falls back instead of breaking. The last
/// answer to each question is kept, so a page reads offline what it showed last time.

const int = z.number().catch(0);
const text = z.string().catch("");
const optText = z.string().nullish().catch(null);
const optInt = z.number().nullish().catch(null);

const remoteFile = z.object({
  filename: text,
  filepath: text,
  filesize: int,
  fileurl: text,
  timemodified: int,
  mimetype: text,
  /// `file`, `url` (a link: `fileurl` is where it goes) or `content`.
  type: text,
});
export type RemoteFile = z.infer<typeof remoteFile>;
const files = z.array(remoteFile).catch([]);

const siteInfoSchema = z.object({
  sitename: text,
  fullname: text,
  userid: int,
  siteurl: text,
});

const courseSchema = z.object({
  id: int,
  shortname: text,
  fullname: text,
  summary: text,
  startdate: int,
  enddate: int,
  progress: z.number().nullish().catch(null),
  hidden: z.boolean().catch(false),
  /// The course's banner, when its teachers set one.
  overviewfiles: files,
});
export type MoodleCourse = z.infer<typeof courseSchema>;

const moduleSchema = z.object({
  /// The id in Moodle's page addresses (`cmid` elsewhere).
  id: int,
  name: text,
  modname: text,
  url: text,
  description: text,
  uservisible: z.boolean().nullish().catch(null),
  contents: files,
});
export type MoodleModule = z.infer<typeof moduleSchema>;

const sectionSchema = z.object({
  id: int,
  name: text,
  summary: text,
  uservisible: z.boolean().nullish().catch(null),
  modules: z.array(moduleSchema).catch([]),
});
export type MoodleSection = z.infer<typeof sectionSchema>;

const assignmentSchema = z.object({
  id: int,
  cmid: int,
  name: text,
  duedate: int,
  allowsubmissionsfromdate: int,
  cutoffdate: int,
  intro: text,
  introattachments: files,
});
export type MoodleAssignment = z.infer<typeof assignmentSchema>;

const statusSchema = z.object({
  lastattempt: z
    .object({
      submission: z.object({ status: optText }).nullish().catch(null),
      gradingstatus: optText,
    })
    .nullish()
    .catch(null),
  feedback: z
    .object({
      gradefordisplay: optText,
      plugins: z.array(z.object({ editorfields: z.array(z.object({ text })).catch([]) })).catch([]),
    })
    .nullish()
    .catch(null),
});

/// Where an assignment stands for the person: handed in or not, marked or not, and what came
/// back.
export interface MoodleAssignmentStatus {
  /// `new`, `draft`, `submitted` or `reopened`.
  submission: string | null;
  grading: string | null;
  grade: string | null;
  feedback: string[];
}

function readStatus(answer: z.infer<typeof statusSchema>): MoodleAssignmentStatus {
  return {
    submission: answer.lastattempt?.submission?.status ?? null,
    grading: answer.lastattempt?.gradingstatus ?? null,
    grade: answer.feedback?.gradefordisplay ?? null,
    feedback: (answer.feedback?.plugins ?? [])
      .flatMap((plugin) => plugin.editorfields)
      .map((field) => field.text)
      .filter((t) => t.trim() !== ""),
  };
}

const gradeItemSchema = z.object({
  id: int,
  itemname: optText,
  itemtype: text,
  itemmodule: optText,
  cmid: optInt,
  gradeformatted: optText,
  rangeformatted: optText,
  percentageformatted: optText,
  weightformatted: optText,
  feedback: optText,
});
export type MoodleGradeItem = z.infer<typeof gradeItemSchema>;

const forumSchema = z.object({
  id: int,
  cmid: int,
  name: text,
  /// `news` is the course's announcements.
  type: text,
  intro: text,
  numdiscussions: int,
});
export type MoodleForum = z.infer<typeof forumSchema>;

const discussionSchema = z.object({
  discussion: int,
  name: text,
  subject: text,
  message: text,
  userfullname: text,
  timemodified: int,
  numreplies: int,
  pinned: z.boolean().catch(false),
  attachments: files,
});
export type MoodleDiscussion = z.infer<typeof discussionSchema>;

const postSchema = z.object({
  id: int,
  parentid: int,
  subject: text,
  message: text,
  author: z.object({ fullname: text }).catch({ fullname: "" }),
  timecreated: int,
  attachments: files,
});

/// Why a call failed: the sign in is gone (connect again), out of reach, or anything else.
export class MoodleError extends Error {
  constructor(
    message: string,
    readonly signInNeeded = false,
  ) {
    super(message);
  }
}

const UNREACHABLE = "Nookly couldn't reach Moodle. Check the connection and try again.";

const errorSchema = z.object({
  exception: z.string(),
  errorcode: z.string().catch(""),
  message: z.string().catch(""),
});

/// What Moodle's error means for the person, as the desktop says it.
function describe(fn: string, error: z.infer<typeof errorSchema>): MoodleError {
  if (error.errorcode === "invalidtoken" || /token/i.test(error.message)) {
    return new MoodleError("Your Moodle sign in expired. Connect again.", true);
  }
  if (
    ["servicenotavailable", "webservicesnotenabled", "restwsnotenabled"].includes(error.errorcode)
  ) {
    return new MoodleError(
      "This Moodle site has the mobile app service turned off, so Nookly can't read it.",
    );
  }
  return new MoodleError(
    `Moodle doesn't allow Nookly to read this (${fn}${error.errorcode ? `: ${error.errorcode}` : ""}).`,
  );
}

/// A form value for a list parameter: `courseids[0]=4`.
const listParam = (name: string, values: number[]) =>
  Object.fromEntries(values.map((v, i) => [`${name}[${i}]`, String(v)]));

export interface Connection {
  site: Site;
  token: string;
  userId: number;
  siteName: string;
  fullName: string;
}

/// How the phone reaches the network: `fetch`, or a faithful stand in for tests.
export type Http = (
  url: string,
  init: { method: "GET" | "POST"; headers?: Record<string, string>; body?: string },
) => Promise<Pick<Response, "ok" | "status" | "text">>;

/// The last answers, kept for reading offline: files in the phone's own folder, or a test's
/// memory. Forgotten on sign out.
export interface AnswerCache {
  get(key: string): Promise<string | null>;
  set(key: string, body: string): Promise<void>;
  clear(): Promise<void>;
}

/// An answer, and whether Moodle was out of reach so it is the last one it gave.
export interface Fetched<T> {
  data: T;
  offline: boolean;
}

/// Reads the JSON Moodle sent (fresh or kept) with `schema`.
function read<T>(fn: string, json: string, schema: z.ZodType<T>): T {
  let body: unknown;
  try {
    body = JSON.parse(json);
  } catch {
    throw new MoodleError("That address is not a Moodle site.");
  }
  const error = errorSchema.safeParse(body);
  if (error.success) throw describe(fn, error.data);
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new MoodleError("Moodle answered in a way Nookly can't read.");
  return parsed.data;
}

const id = (n: number) => String(n);

/// Moodle's functions, reached through `http`, their answers kept in `cache`.
export function moodleApi(http: Http, cache: AnswerCache) {
  /// Asks Moodle. When it is out of reach, the last answer to the same question is read
  /// instead and marked offline.
  async function call<T>(
    site: Site,
    token: string,
    fn: string,
    params: Record<string, string>,
    schema: z.ZodType<T>,
  ): Promise<Fetched<T>> {
    const key = `${site.root}|${fn}|${new URLSearchParams(params).toString()}`;
    const kept = async (): Promise<Fetched<T>> => {
      const body = await cache.get(key);
      if (body === null) throw new MoodleError(UNREACHABLE);
      return { data: read(fn, body, schema), offline: true };
    };
    let response: Awaited<ReturnType<Http>>;
    try {
      response = await http(pageOf(site, "webservice/rest/server.php"), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          wstoken: token,
          wsfunction: fn,
          moodlewsrestformat: "json",
          ...params,
        }).toString(),
      });
    } catch {
      return kept();
    }
    if (response.status >= 500) return kept();
    if (!response.ok) throw new MoodleError(`Moodle answered with an error (${response.status}).`);
    const body = await response.text();
    const data = read(fn, body, schema);
    await cache.set(key, body).catch(() => {});
    return { data, offline: false };
  }

  const map = async <A, B>(fetched: Promise<Fetched<A>>, f: (a: A) => B): Promise<Fetched<B>> => {
    const { data, offline } = await fetched;
    return { data: f(data), offline };
  };

  return {
    /// Who signed in, for finishing a sign in; never read from what was kept.
    siteInfo: async (site: Site, token: string) => {
      let response: Awaited<ReturnType<Http>>;
      try {
        response = await http(pageOf(site, "webservice/rest/server.php"), {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            wstoken: token,
            wsfunction: "core_webservice_get_site_info",
            moodlewsrestformat: "json",
          }).toString(),
        });
      } catch {
        throw new MoodleError(UNREACHABLE);
      }
      if (!response.ok) {
        throw new MoodleError(`Moodle answered with an error (${response.status}).`);
      }
      return read("core_webservice_get_site_info", await response.text(), siteInfoSchema);
    },

    courses: (c: Connection) =>
      call(
        c.site,
        c.token,
        "core_enrol_get_users_courses",
        { userid: id(c.userId) },
        z.array(courseSchema),
      ),

    /// A course's sections and what is in them, leaving out what the person can't see.
    contents: (c: Connection, courseId: number) =>
      map(
        call(
          c.site,
          c.token,
          "core_course_get_contents",
          { courseid: id(courseId) },
          z.array(sectionSchema),
        ),
        (sections) =>
          sections
            .filter((s) => s.uservisible !== false)
            .map((s) => ({ ...s, modules: s.modules.filter((m) => m.uservisible !== false) })),
      ),

    assignments: (c: Connection, courseId: number) =>
      map(
        call(
          c.site,
          c.token,
          "mod_assign_get_assignments",
          listParam("courseids", [courseId]),
          z.object({
            courses: z
              .array(z.object({ assignments: z.array(assignmentSchema).catch([]) }))
              .catch([]),
          }),
        ),
        (answer) => answer.courses.flatMap((course) => course.assignments),
      ),

    assignmentStatus: (c: Connection, assignmentId: number) =>
      map(
        call(
          c.site,
          c.token,
          "mod_assign_get_submission_status",
          { assignid: id(assignmentId), userid: id(c.userId) },
          statusSchema,
        ),
        readStatus,
      ),

    grades: (c: Connection, courseId: number) =>
      map(
        call(
          c.site,
          c.token,
          "gradereport_user_get_grade_items",
          { courseid: id(courseId), userid: id(c.userId) },
          z.object({
            usergrades: z
              .array(z.object({ gradeitems: z.array(gradeItemSchema).catch([]) }))
              .catch([]),
          }),
        ),
        (answer) => answer.usergrades.flatMap((u) => u.gradeitems),
      ),

    forums: (c: Connection, courseId: number) =>
      call(
        c.site,
        c.token,
        "mod_forum_get_forums_by_courses",
        listParam("courseids", [courseId]),
        z.array(forumSchema),
      ),

    discussions: (c: Connection, forumId: number) =>
      map(
        call(
          c.site,
          c.token,
          "mod_forum_get_forum_discussions",
          { forumid: id(forumId), page: "0", perpage: "100" },
          z.object({ discussions: z.array(discussionSchema).catch([]) }),
        ),
        (answer) => answer.discussions,
      ),

    posts: (c: Connection, discussionId: number) =>
      map(
        call(
          c.site,
          c.token,
          "mod_forum_get_discussion_posts",
          { discussionid: id(discussionId), sortby: "created", sortdirection: "ASC" },
          z.object({ posts: z.array(postSchema).catch([]) }),
        ),
        (answer) => answer.posts,
      ),

    /// The body of a Moodle page (an HTML file on the site), kept like any answer.
    pageText: async (c: Connection, url: string): Promise<Fetched<string>> => {
      const key = `${c.site.root}|page|${url}`;
      const target = fileUrl(c, url);
      if (!target) throw new MoodleError("That page is not on your Moodle site.");
      try {
        const response = await http(target, { method: "GET" });
        if (response.ok) {
          const body = await response.text();
          await cache.set(key, body).catch(() => {});
          return { data: body, offline: false };
        }
        if (response.status < 500) {
          throw new MoodleError(`Moodle answered with an error (${response.status}).`);
        }
      } catch (error) {
        if (error instanceof MoodleError) throw error;
      }
      const kept = await cache.get(key);
      if (kept === null) throw new MoodleError(UNREACHABLE);
      return { data: kept, offline: true };
    },
  };
}

export type MoodleApi = ReturnType<typeof moodleApi>;

/// The address of a file on the site with the token added, for opening it: files are only
/// ever fetched from the site itself, so the token can't leak to another host.
export function fileUrl(c: Connection, url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!`${parsed.origin}${parsed.pathname}`.startsWith(c.site.root)) return null;
  if (!parsed.pathname.includes("/webservice/")) {
    parsed.pathname = parsed.pathname.replace("/pluginfile.php", "/webservice/pluginfile.php");
  }
  parsed.searchParams.set("token", c.token);
  return parsed.toString();
}
