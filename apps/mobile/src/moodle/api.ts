import { z } from "zod";
import { pageOf, type Site } from "./login.ts";

/// Moodle's web services, as the desktop calls them (`moodle/api.rs`, `moodle/service.rs`,
/// `moodle/model.rs`): one form posted to `webservice/rest/server.php` per function, the
/// answer read through a schema so a missing field falls back instead of breaking.

const int = z.number().catch(0);
const text = z.string().catch("");
const optText = z.string().nullish().catch(null);

const remoteFile = z.object({
  filename: text,
  filesize: int,
  fileurl: text,
  timemodified: int,
  mimetype: text,
  type: text,
});
export type RemoteFile = z.infer<typeof remoteFile>;
const files = z.array(remoteFile).catch([]);

export const siteInfoSchema = z.object({
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
});
export type MoodleCourse = z.infer<typeof courseSchema>;

const moduleSchema = z.object({
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

const gradeItemSchema = z.object({
  id: int,
  itemname: optText,
  itemtype: text,
  itemmodule: optText,
  gradeformatted: optText,
  rangeformatted: optText,
  percentageformatted: optText,
  feedback: optText,
});
export type MoodleGradeItem = z.infer<typeof gradeItemSchema>;

const forumSchema = z.object({
  id: int,
  cmid: int,
  name: text,
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
});
export type MoodleDiscussion = z.infer<typeof discussionSchema>;

const postSchema = z.object({
  id: int,
  parentid: int,
  subject: text,
  message: text,
  author: z.object({ fullname: text }).catch({ fullname: "" }),
  timecreated: int,
});
export type MoodlePost = z.infer<typeof postSchema>;

/// Why a call failed: the sign in is gone (connect again), or anything else.
export class MoodleError extends Error {
  constructor(
    message: string,
    readonly signInNeeded = false,
  ) {
    super(message);
  }
}

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
  init: { method: "POST"; headers: Record<string, string>; body: string },
) => Promise<Pick<Response, "ok" | "status" | "json">>;

/// Calls one function and reads its answer with `schema`.
export async function call<T>(
  http: Http,
  site: Site,
  token: string,
  fn: string,
  params: Record<string, string>,
  schema: z.ZodType<T>,
): Promise<T> {
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
    throw new MoodleError("Moodle can't be reached. Check the connection and try again.");
  }
  if (!response.ok) throw new MoodleError(`Moodle answered with an error (${response.status}).`);
  let body: unknown;
  try {
    body = await response.json();
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

/// Moodle's functions, reached through `http`.
export function moodleApi(http: Http) {
  return {
    siteInfo: (site: Site, token: string) =>
      call(http, site, token, "core_webservice_get_site_info", {}, siteInfoSchema),

    courses: (c: Connection) =>
      call(
        http,
        c.site,
        c.token,
        "core_enrol_get_users_courses",
        { userid: id(c.userId) },
        z.array(courseSchema),
      ),

    /// A course's sections and what is in them, leaving out what the person can't see.
    contents: async (c: Connection, courseId: number) =>
      (
        await call(
          http,
          c.site,
          c.token,
          "core_course_get_contents",
          { courseid: id(courseId) },
          z.array(sectionSchema),
        )
      )
        .filter((s) => s.uservisible !== false)
        .map((s) => ({ ...s, modules: s.modules.filter((m) => m.uservisible !== false) })),

    assignments: async (c: Connection, courseId: number) =>
      (
        await call(
          http,
          c.site,
          c.token,
          "mod_assign_get_assignments",
          listParam("courseids", [courseId]),
          z.object({
            courses: z
              .array(z.object({ assignments: z.array(assignmentSchema).catch([]) }))
              .catch([]),
          }),
        )
      ).courses.flatMap((course) => course.assignments),

    grades: async (c: Connection, courseId: number) =>
      (
        await call(
          http,
          c.site,
          c.token,
          "gradereport_user_get_grade_items",
          { courseid: id(courseId), userid: id(c.userId) },
          z.object({
            usergrades: z
              .array(z.object({ gradeitems: z.array(gradeItemSchema).catch([]) }))
              .catch([]),
          }),
        )
      ).usergrades.flatMap((u) => u.gradeitems),

    forums: (c: Connection, courseId: number) =>
      call(
        http,
        c.site,
        c.token,
        "mod_forum_get_forums_by_courses",
        listParam("courseids", [courseId]),
        z.array(forumSchema),
      ),

    discussions: async (c: Connection, forumId: number) =>
      (
        await call(
          http,
          c.site,
          c.token,
          "mod_forum_get_forum_discussions",
          { forumid: id(forumId), page: "0", perpage: "100" },
          z.object({ discussions: z.array(discussionSchema).catch([]) }),
        )
      ).discussions,

    posts: async (c: Connection, discussionId: number) =>
      (
        await call(
          http,
          c.site,
          c.token,
          "mod_forum_get_discussion_posts",
          { discussionid: id(discussionId), sortby: "created", sortdirection: "ASC" },
          z.object({ posts: z.array(postSchema).catch([]) }),
        )
      ).posts,
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
