import { z } from "zod";
import file from "../../../../whats-new.json";

const highlight = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  /// A name from `features/whats-new/icons.ts`.
  icon: z.string().optional(),
  tag: z.enum(["New", "Improved"]).optional(),
  /// A hotkey such as `Mod+Shift+J`, shown as keys on the card.
  shortcut: z.string().optional(),
});

const entry = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().min(1),
  summary: z.string().min(1),
  highlights: z.array(highlight).default([]),
  /// Short lines under a heading each (`Improved`, `Fixed`), for what is not a headline.
  more: z.record(z.string(), z.array(z.string())).default({}),
});

export type WhatsNewEntry = z.infer<typeof entry>;
export type WhatsNewHighlight = z.infer<typeof highlight>;

export interface WhatsNewFile {
  versions: readonly object[];
}

/// The versions in `whats-new.json` that are valid. Each is read on its own, so a typo in
/// one never hides the rest, and never reaches the screen half read.
export function parseWhatsNew(data: WhatsNewFile = file): WhatsNewEntry[] {
  return data.versions.flatMap((candidate) => {
    const parsed = entry.safeParse(candidate);
    return parsed.success ? [parsed.data] : [];
  });
}

/// The highlights of one version, and only that version.
export function whatsNewFor(version: string, data: WhatsNewFile = file): WhatsNewEntry | undefined {
  return parseWhatsNew(data).find((e) => e.version === version);
}
