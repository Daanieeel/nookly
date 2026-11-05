import type { MoodleFile } from "#/lib/api/moodle.ts";

/// What a file is called to Nookly's importer: where it lives on the site, without the query
/// that differs between a view and a download link. The same file always gets the same key,
/// which is how the module tells it was imported.
export function originOf(file: MoodleFile): string {
  return `moodle:${file.fileUrl.split(/[?#]/)[0]}`;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1 ? name.slice(dot) : "";
}

const withoutExtension = (name: string) => name.slice(0, name.length - extensionOf(name).length);

/// Names to offer for the File, best first: what the item is called on Moodle (which reads
/// better than a file name like `lecture1.pdf`) with the file's extension, then the file's own
/// name.
export function suggestTitles(file: MoodleFile, itemName?: string): string[] {
  const own = file.fileName;
  const item = itemName
    ?.replace(/[/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!item || item.toLowerCase() === withoutExtension(own).toLowerCase()) return [own];
  const extension = extensionOf(own);
  const named = item.toLowerCase().endsWith(extension.toLowerCase()) ? item : `${item}${extension}`;
  return named === own ? [own] : [named, own];
}

/// Labels worth putting on the File: its course, then its section of the course.
export function suggestLabelNames(
  course: { shortName: string; fullName: string },
  sectionName?: string,
): string[] {
  const courseLabel = (course.shortName || course.fullName).trim();
  const section = sectionName?.trim();
  return [
    ...(courseLabel ? [courseLabel] : []),
    ...(section && ![course.shortName, course.fullName].includes(section) ? [section] : []),
  ];
}

/// The course of Nookly that is this Moodle course: the same name, short or full, ignoring
/// case. Never a guess.
export function matchCourse<T extends { title: string }>(
  courses: T[],
  course: { shortName: string; fullName: string },
): T | undefined {
  const names = [course.shortName, course.fullName]
    .map((n) => n.trim().toLowerCase())
    .filter(Boolean);
  return courses.find((c) => names.includes(c.title.trim().toLowerCase()));
}
