import { LINK_KIND, fileKindOfName } from "#/features/files/file-kind.ts";
import {
  IconBook2,
  IconClipboardList,
  IconFile,
  IconMessages,
  type Icon,
} from "@tabler/icons-react";

/// An icon with the colors of its tile, from the theme's accents.
export interface Look {
  icon: Icon;
  tone: string;
}

/// A tile in the color of the kind's icon, which `files/file-kind.ts` tints with a text color.
const TILES = new Map([
  ["text-positive", "bg-positive/10 text-positive"],
  ["text-destructive", "bg-destructive/10 text-destructive"],
  ["text-primary", "bg-primary/10 text-primary"],
  ["text-caution", "bg-caution/10 text-caution"],
  ["text-muted-foreground", "bg-muted text-muted-foreground"],
]);

/// How a file or link is drawn: the same icon and color as everywhere else in Nookly.
export function fileLook(kind: string, fileName: string): Look {
  const { icon, tone } = kind === "url" ? LINK_KIND : fileKindOfName(fileName);
  return { icon, tone: TILES.get(tone) ?? "bg-muted text-muted-foreground" };
}

const PLAIN_FILE: Look = { icon: IconFile, tone: "bg-muted text-muted-foreground" };

const MODULE_LOOKS = new Map<string, Look>([
  ["assign", { icon: IconClipboardList, tone: "bg-accent-purple/10 text-accent-purple" }],
  ["forum", { icon: IconMessages, tone: "bg-accent-green/10 text-accent-green" }],
  ["page", { icon: IconBook2, tone: "bg-accent-blue/10 text-accent-blue" }],
  ["url", { icon: LINK_KIND.icon, tone: "bg-primary/10 text-primary" }],
]);

/// How a course item is drawn, by the kind of item Moodle says it is.
export function moduleLook(modName: string): Look {
  return MODULE_LOOKS.get(modName) ?? PLAIN_FILE;
}
