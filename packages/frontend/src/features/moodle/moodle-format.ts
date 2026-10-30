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
