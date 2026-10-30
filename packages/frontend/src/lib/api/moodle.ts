import { invoke } from "@tauri-apps/api/core";

/// A read only view of the user's Moodle site. Nothing here is an entity: it is read from
/// Moodle on demand and cached for offline use. See `src-tauri/src/moodle/`.
/// Dates are Unix seconds, `0` for none.

export interface MoodleStatus {
  connected: boolean;
  /// Signed in before, but the sign in is gone (a restored backup, say).
  needsReconnect: boolean;
  siteUrl: string | null;
  siteName: string | null;
  fullName: string | null;
}

/// An answer, and whether Moodle was out of reach so it is the last one it gave.
export interface Fetched<T> {
  data: T;
  fetchedAt: string;
  offline: boolean;
}

export interface MoodleCourse {
  id: number;
  shortName: string;
  fullName: string;
  summary: string;
  startDate: number;
  endDate: number;
  progress: number | null;
  hidden: boolean;
}

export interface MoodleFile {
  /// `file`, `url` (a link: `fileUrl` is where it goes) or `content`.
  kind: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  fileUrl: string;
  timeModified: number;
  mimeType: string;
}

export interface MoodleModule {
  /// The id in Moodle's page addresses.
  id: number;
  name: string;
  modName: string;
  url: string;
  description: string;
  contents: MoodleFile[];
}

export interface MoodleSection {
  id: number;
  name: string;
  summary: string;
  modules: MoodleModule[];
}

export interface MoodleAssignment {
  id: number;
  cmid: number;
  name: string;
  dueDate: number;
  openDate: number;
  cutOffDate: number;
  intro: string;
  attachments: MoodleFile[];
}

export interface MoodleAssignmentStatus {
  /// `new`, `draft`, `submitted` or `reopened`.
  submissionStatus: string | null;
  gradingStatus: string | null;
  grade: string | null;
  feedback: string[];
}

export interface MoodleGradeItem {
  id: number;
  name: string | null;
  /// `course` is the total.
  itemType: string;
  itemModule: string | null;
  cmid: number | null;
  grade: string | null;
  range: string | null;
  percentage: string | null;
  weight: string | null;
  feedback: string | null;
}

export interface MoodleForum {
  id: number;
  cmid: number;
  name: string;
  /// `news` is the course's announcements.
  kind: string;
  intro: string;
  numDiscussions: number;
}

export interface MoodleDiscussion {
  discussionId: number;
  name: string;
  subject: string;
  message: string;
  author: string;
  timeModified: number;
  numReplies: number;
  pinned: boolean;
  attachments: MoodleFile[];
}

export interface MoodlePost {
  id: number;
  parentId: number;
  subject: string;
  message: string;
  author: { fullName: string };
  timeCreated: number;
  attachments: MoodleFile[];
}

export const moodleStatus = (): Promise<MoodleStatus> => invoke("moodle_status");

/// Resolves to the Moodle sign in page to open in the browser.
export const moodleBeginLogin = (site: string): Promise<string> =>
  invoke("moodle_begin_login", { site });

/// `callback` is the `nookly://token=...` link Moodle redirects to, or what follows `token=`.
export const moodleFinishLogin = (callback: string): Promise<MoodleStatus> =>
  invoke("moodle_finish_login", { callback });

/// Forgets the site and its cached answers. Files already downloaded stay.
export const moodleDisconnect = (): Promise<void> => invoke("moodle_disconnect");

export const moodleCourses = (): Promise<Fetched<MoodleCourse[]>> => invoke("moodle_courses");

export const moodleContents = (courseId: number): Promise<Fetched<MoodleSection[]>> =>
  invoke("moodle_contents", { courseId });

export const moodleAssignments = (courseId: number): Promise<Fetched<MoodleAssignment[]>> =>
  invoke("moodle_assignments", { courseId });

export const moodleAssignmentStatus = (
  assignmentId: number,
): Promise<Fetched<MoodleAssignmentStatus>> => invoke("moodle_assignment_status", { assignmentId });

export const moodleGrades = (courseId: number): Promise<Fetched<MoodleGradeItem[]>> =>
  invoke("moodle_grades", { courseId });

export const moodleForums = (courseId: number): Promise<Fetched<MoodleForum[]>> =>
  invoke("moodle_forums", { courseId });

export const moodleDiscussions = (forumId: number): Promise<Fetched<MoodleDiscussion[]>> =>
  invoke("moodle_discussions", { forumId });

export const moodlePosts = (discussionId: number): Promise<Fetched<MoodlePost[]>> =>
  invoke("moodle_posts", { discussionId });

/// The body of a Moodle page (an HTML file on the site).
export const moodleFileText = (url: string): Promise<string> => invoke("moodle_file_text", { url });

/// Downloads a file once and opens it with the system's app for it.
export const moodleOpenFile = (file: MoodleFile): Promise<void> =>
  invoke("moodle_open_file", {
    url: file.fileUrl,
    fileName: file.fileName,
    timeModified: file.timeModified,
  });
