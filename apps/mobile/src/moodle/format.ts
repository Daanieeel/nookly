import { fileKindOf } from "@nookly/shared/data";
import { fileSize, fileTypeLabel } from "@nookly/shared/moodle/format";
import {
  IconBook2,
  IconClipboardList,
  IconFile,
  IconLink,
  IconMessages,
} from "@tabler/icons-react-native";
import type { GlyphIcon } from "../ui/kit/Glyph.tsx";
import type { TintName } from "../ui/tokens.ts";
import { KIND_ICONS } from "../screens/file-kinds.ts";
import { dayLabel, localDay } from "../screens/dates.ts";
import type { MoodleCourse, RemoteFile } from "./api.ts";

/// How Moodle's things read and look on the phone, as on the desktop (`moodle-format.ts`,
/// `moodle-icons.tsx`, `moodle-html.ts`).

const ENTITIES = new Map([
  ["nbsp", " "],
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["#39", "'"],
  ["apos", "'"],
]);

/// Text out of Moodle's HTML (a summary, a post, a page): paragraphs and headings apart,
/// list items as bullets, and images by their description in brackets, because Moodle's
/// images need the sign in (the page on Moodle shows them).
export function moodleText(html: string): string {
  return html
    .replaceAll("@@PLUGINFILE@@", "")
    .replace(/<img\b[^>]*>/gi, (tag) => {
      const alt = /\balt\s*=\s*(["'])(.*?)\1/i.exec(tag)?.[2]?.trim();
      return alt ? `[${alt}]` : "";
    })
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|ul|ol|blockquote|tr|table|pre)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(nbsp|amp|lt|gt|quot|#39|apos);/g, (_, name: string) => ENTITIES.get(name) ?? "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/// A Moodle date (seconds since 1970) as a day the phone writes, or null for none.
export function moodleDay(seconds: number, today = localDay()): string | null {
  return seconds > 0 ? dayLabel(localDay(new Date(seconds * 1000)), today) : null;
}

/// Up to two initials of a name, for the tile beside a post.
export function initialsOf(name: string): string {
  const words = name.replace(",", " ").trim().split(/\s+/).filter(Boolean);
  const [first, second] = name.includes(",") ? [words[1], words[0]] : [words[0], words.at(-1)];
  return [first, words.length > 1 ? second : undefined]
    .map((w) => w?.charAt(0).toUpperCase() ?? "")
    .join("");
}

const hasEnded = (c: MoodleCourse, now: number) => c.enddate > 0 && c.enddate < now;

/// The courses that are on, then those that are over, each by name; hidden ones left out.
export function splitCourses(courses: MoodleCourse[], now = Date.now() / 1000) {
  const sorted = courses
    .filter((c) => !c.hidden)
    .sort((a, b) => a.fullname.localeCompare(b.fullname));
  return {
    current: sorted.filter((c) => !hasEnded(c, now)),
    past: sorted.filter((c) => hasEnded(c, now)),
  };
}

/// What a file says about itself on its row: its type, its size and its name when the title
/// isn't it.
export function fileFacts(file: RemoteFile, title?: string): string {
  return [
    file.type === "url" ? "Link" : fileTypeLabel(file.filename),
    file.type !== "url" && file.filesize > 0 && fileSize(file.filesize),
    title !== undefined && title !== file.filename && file.filename,
  ]
    .filter((fact): fact is string => typeof fact === "string")
    .join(" · ");
}

export interface Look {
  glyph: GlyphIcon;
  tint: TintName;
}

/// The desktop's colors for the kinds (`files/file-kind.ts`); the rest are gray.
const KIND_TINTS = new Map<string, TintName>([
  ["image", "green"],
  ["pdf", "red"],
  ["document", "blue"],
  ["sheet", "green"],
  ["slides", "yellow"],
  ["audio", "blue"],
  ["video", "blue"],
]);

/// A file or link as everywhere else in Nookly: the icon of its kind.
export function fileLook(file: RemoteFile): Look {
  if (file.type === "url") return { glyph: IconLink, tint: "gray" };
  const kind = fileKindOf(file.filename);
  return { glyph: KIND_ICONS[kind], tint: KIND_TINTS.get(kind) ?? "gray" };
}

const MODULE_LOOKS = new Map<string, Look>([
  ["assign", { glyph: IconClipboardList, tint: "purple" }],
  ["forum", { glyph: IconMessages, tint: "green" }],
  ["page", { glyph: IconBook2, tint: "blue" }],
  ["url", { glyph: IconLink, tint: "blue" }],
]);

/// A course item, by the kind of item Moodle says it is.
export const moduleLook = (modName: string): Look =>
  MODULE_LOOKS.get(modName) ?? { glyph: IconFile, tint: "gray" };
