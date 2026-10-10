import { type ChangelogEntry, compareVersions, parseChangelog } from "#/lib/changelog.ts";
import changelogText from "../../../../CHANGELOG.md?raw";
import { type WhatsNewEntry, type WhatsNewFile, parseWhatsNew } from "#/lib/whats-new.ts";

/// One version in what the What's new dialog shows.
export interface Release {
  version: string;
  date: string | null;
  /// Written up in `whats-new.json`: a headline, highlights and the smaller lines.
  notes?: WhatsNewEntry;
  /// Only in `CHANGELOG.md`, shown as its bullet points.
  written?: ChangelogEntry;
}

export interface ReleasesSince {
  releases: Release[];
  /// Releases in range that were left out for being past `MAX_RELEASES`.
  hidden: number;
}

/// The most versions one dialog shows; older ones are left to the full changelog.
export const MAX_RELEASES = 4;

/// What is new since the version the user last saw: every release after it, up to the one
/// running, newest first. A release counts whether or not it was ever shipped on its own,
/// so a jump over several versions shows them all. With no earlier version to compare with
/// (a first run, or one that is not older) it is the running version alone. A version
/// with no notes anywhere is simply left out.
export function releasesSince(
  since: string | null,
  running: string,
  notes?: WhatsNewFile,
  changelog: string = changelogText,
): ReleasesSince {
  const written = parseChangelog(changelog);
  const noted = parseWhatsNew(notes);
  const known = new Set([...noted.map((e) => e.version), ...written.map((e) => e.version)]);
  const inRange = (version: string) =>
    compareVersions(version, running) <= 0 &&
    (since !== null && compareVersions(since, running) < 0
      ? compareVersions(version, since) > 0
      : version === running);
  const all = [...known]
    .filter(inRange)
    .toSorted((a, b) => compareVersions(b, a))
    .map((version): Release => {
      const entry = noted.find((e) => e.version === version);
      const text = written.find((e) => e.version === version);
      return { version, date: entry?.date ?? text?.date ?? null, notes: entry, written: text };
    });
  return { releases: all.slice(0, MAX_RELEASES), hidden: Math.max(0, all.length - MAX_RELEASES) };
}
