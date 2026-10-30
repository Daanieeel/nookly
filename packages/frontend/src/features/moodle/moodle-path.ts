/// Where the Moodle module is, as the `moodlePath` of its view, so every page has its own
/// tab history: `` (your courses), `course/4`, `course/4/assignments/3`, `course/4/forums/2/9`.
export const COURSE_TABS = ["contents", "assignments", "grades", "forums"] as const;
export type CourseTab = (typeof COURSE_TABS)[number];

export type MoodleLocation =
  | { page: "courses" }
  | { page: "course"; courseId: number; tab: CourseTab }
  | { page: "assignment"; courseId: number; assignmentId: number }
  | { page: "forum"; courseId: number; forumId: number }
  | { page: "discussion"; courseId: number; forumId: number; discussionId: number }
  | { page: "section-page"; courseId: number; cmid: number };

const id = (value: string | undefined): number | null => {
  const n = Number(value);
  return value && Number.isSafeInteger(n) && n > 0 ? n : null;
};

/// Reads a path; anything that doesn't name a page falls back to the course list.
export function parseMoodlePath(path: string | undefined): MoodleLocation {
  const [kind, course, section, a, b] = (path ?? "").split("/");
  const courseId = kind === "course" ? id(course) : null;
  if (courseId === null) return { page: "courses" };
  const first = id(a);
  const second = id(b);
  if (section === "assignments" && first !== null) {
    return { page: "assignment", courseId, assignmentId: first };
  }
  if (section === "forums" && first !== null && second !== null) {
    return { page: "discussion", courseId, forumId: first, discussionId: second };
  }
  if (section === "forums" && first !== null) return { page: "forum", courseId, forumId: first };
  if (section === "page" && first !== null) return { page: "section-page", courseId, cmid: first };
  const tab = COURSE_TABS.find((t) => t === section) ?? "contents";
  return { page: "course", courseId, tab };
}

export function coursePath(courseId: number, tab: CourseTab = "contents"): string {
  return tab === "contents" ? `course/${courseId}` : `course/${courseId}/${tab}`;
}

export const assignmentPath = (courseId: number, assignmentId: number) =>
  `course/${courseId}/assignments/${assignmentId}`;

export const forumPath = (courseId: number, forumId: number) =>
  `course/${courseId}/forums/${forumId}`;

export const discussionPath = (courseId: number, forumId: number, discussionId: number) =>
  `course/${courseId}/forums/${forumId}/${discussionId}`;

export const pagePath = (courseId: number, cmid: number) => `course/${courseId}/page/${cmid}`;

/// The same page on the Moodle website, for the "Open in Moodle" button on every page.
export function moodleWebUrl(siteUrl: string, location: MoodleLocation, cmid?: number): string {
  const site = siteUrl.replace(/\/+$/, "");
  switch (location.page) {
    case "courses":
      return `${site}/my/courses.php`;
    case "course":
      return location.tab === "grades"
        ? `${site}/grade/report/user/index.php?id=${location.courseId}`
        : `${site}/course/view.php?id=${location.courseId}`;
    case "assignment":
      return cmid
        ? `${site}/mod/assign/view.php?id=${cmid}`
        : `${site}/mod/assign/index.php?id=${location.courseId}`;
    case "forum":
      return cmid
        ? `${site}/mod/forum/view.php?id=${cmid}`
        : `${site}/mod/forum/index.php?id=${location.courseId}`;
    case "discussion":
      return `${site}/mod/forum/discuss.php?d=${location.discussionId}`;
    case "section-page":
      return `${site}/mod/page/view.php?id=${location.cmid}`;
  }
}
