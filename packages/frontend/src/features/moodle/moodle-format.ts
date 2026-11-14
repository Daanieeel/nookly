import type { MoodleFile } from "#/lib/api/moodle.ts";
import { fileSize, fileTypeLabel } from "@nookly/shared/moodle/format";
import { formatDateTime, formatShortDate } from "#/lib/datetime.ts";

/// Moodle's dates are Unix seconds, and `0` means none.
export function moodleDate(seconds: number): string | null {
  return seconds > 0 ? formatDateTime(new Date(seconds * 1000)) : null;
}

/// What a file says about itself: its type, size, name when the title isn't it, and when it
/// last changed.
export function fileFacts(file: MoodleFile, title?: string): string[] {
  return [
    file.kind === "url" ? "Link" : fileTypeLabel(file.fileName),
    file.kind !== "url" && file.fileSize > 0 && fileSize(file.fileSize),
    title !== undefined && title !== file.fileName && file.fileName,
    file.timeModified > 0 && formatShortDate(new Date(file.timeModified * 1000)),
  ].filter((fact): fact is string => typeof fact === "string");
}
