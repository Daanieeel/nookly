import { formatDateTime } from "#/lib/datetime.ts";

/// Moodle's dates are Unix seconds, and `0` means none.
export function moodleDate(seconds: number): string | null {
  return seconds > 0 ? formatDateTime(new Date(seconds * 1000)) : null;
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const SUBMISSION = new Map([
  ["new", "Not submitted"],
  ["draft", "Draft"],
  ["submitted", "Submitted"],
  ["reopened", "Reopened"],
]);

export function submissionLabel(status: string | null | undefined): string {
  return (status && SUBMISSION.get(status)) || "Not submitted";
}

const GRADING = new Map([
  ["graded", "Graded"],
  ["notgraded", "Not graded yet"],
  ["released", "Graded"],
  ["readyforrelease", "Graded"],
  ["inmarking", "Being marked"],
  ["readyforreview", "Ready for review"],
]);

export function gradingLabel(status: string | null | undefined): string | null {
  return (status && GRADING.get(status)) || null;
}

export type DueTone = "none" | "overdue" | "soon" | "later";

/// How much a due date calls for attention: past, within three days, or further off.
export function dueTone(dueDate: number, now = Date.now() / 1000): DueTone {
  if (dueDate <= 0) return "none";
  if (dueDate < now) return "overdue";
  return dueDate - now <= 3 * 86_400 ? "soon" : "later";
}

/// The number in a percentage Moodle wrote in the site's language (`85,50 %`), kept within
/// 0 to 100 so it can fill a bar. Nothing for a grade that has none.
export function percentOf(text: string | null | undefined): number | null {
  const number = Number.parseFloat((text ?? "").replace(",", "."));
  return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : null;
}

/// The first name in a full name as Moodle writes it: `Ada Lovelace`, or with the surname first
/// and a comma, `Lovelace, Ada`.
export function firstNameOf(fullName: string | null | undefined): string | null {
  const name = (fullName ?? "").trim();
  const given = name.includes(",") ? name.slice(name.indexOf(",") + 1) : name;
  return given.trim().split(/\s+/)[0] || null;
}

/// A file's type for people: its extension in capitals.
export function fileTypeLabel(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 && dot < fileName.length - 1 ? fileName.slice(dot + 1).toUpperCase() : "File";
}

const MODULE_KINDS = new Map([
  ["assign", "Assignment"],
  ["forum", "Forum"],
  ["page", "Page"],
  ["url", "Link"],
  ["folder", "Folder"],
  ["resource", "File"],
  ["quiz", "Quiz"],
  ["label", "Note"],
  ["book", "Book"],
  ["choice", "Poll"],
  ["feedback", "Survey"],
  ["lesson", "Lesson"],
  ["workshop", "Workshop"],
  ["wiki", "Wiki"],
  ["glossary", "Glossary"],
  ["data", "Database"],
  ["h5pactivity", "Interactive"],
  ["scorm", "Course package"],
  ["lti", "External tool"],
  ["chat", "Chat"],
]);

/// What kind of item Moodle holds, from Moodle's short word for it.
export function moduleKindLabel(modName: string): string {
  return MODULE_KINDS.get(modName) ?? modName.charAt(0).toUpperCase() + modName.slice(1);
}
