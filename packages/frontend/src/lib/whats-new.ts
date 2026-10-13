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

const entry = z
  .object({
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    /// The headline box. `title` and `summary` come together or not at all.
    title: z.string().min(1).optional(),
    summary: z.string().min(1).optional(),
    highlights: z.array(highlight).default([]),
    /// Short lines under a heading each (`Improved`, `Fixed`), for what is not a headline.
    more: z.record(z.string(), z.array(z.string())).default({}),
  })
  .refine((e) => (e.title === undefined) === (e.summary === undefined), {
    message: "title and summary must both be set or both be left out",
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

/// What is wrong with `whats-new.json`, one line per problem, for CI. Empty when the file is
/// fine; `parseWhatsNew` skips these versions quietly, this says which and why.
export function whatsNewIssues(data: WhatsNewFile = file): string[] {
  const seen = new Set<string>();
  return data.versions.flatMap((candidate, index) => {
    const named = z.object({ version: z.string() }).safeParse(candidate);
    const label = named.success ? named.data.version : `#${index + 1}`;
    const parsed = entry.safeParse(candidate);
    if (!parsed.success) {
      return parsed.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
        return `${label}: ${path}${issue.message}`;
      });
    }
    if (seen.has(label)) return [`${label}: listed twice`];
    seen.add(label);
    return [];
  });
}

/// The highlights of one version, and only that version.
export function whatsNewFor(version: string, data: WhatsNewFile = file): WhatsNewEntry | undefined {
  return parseWhatsNew(data).find((e) => e.version === version);
}
