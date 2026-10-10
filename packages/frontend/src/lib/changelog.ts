import changelog from "../../../../CHANGELOG.md?raw";

/// Where the whole changelog lives, for the "See full changelog" button.
export const CHANGELOG_URL = "https://github.com/Daanieeel/nookly/blob/main/CHANGELOG.md";

export interface ChangelogEntry {
  version: string;
  date: string | null;
  /// The markdown under the version's heading, without the heading.
  body: string;
}

const HEADING = /^##\s+\[?v?(\d+\.\d+\.\d+)\]?(?:\s*[-(]?\s*(\d{4}-\d{2}-\d{2})\)?)?\s*$/;

/// The versions of a changelog written as `## 0.31.10 (2026-10-10)` headings, each with
/// the text up to the next one. The changelog is written by hand, for the people who use
/// Nookly, so a section is shown as it is.
export function parseChangelog(text: string): ChangelogEntry[] {
  const entries: { version: string; date: string | null; lines: string[] }[] = [];
  for (const line of text.split("\n")) {
    const heading = HEADING.exec(line.trimEnd());
    if (heading?.[1]) {
      entries.push({ version: heading[1], date: heading[2] ?? null, lines: [] });
    } else {
      entries.at(-1)?.lines.push(line);
    }
  }
  return entries.map(({ version, date, lines }) => ({
    version,
    date,
    body: lines.join("\n").trim(),
  }));
}

/// The notes of one version, and only that version.
export function changelogFor(
  version: string,
  text: string = changelog,
): ChangelogEntry | undefined {
  return parseChangelog(text).find((entry) => entry.version === version);
}

/// Negative when `a` is the older version, positive when it is the newer.
export function compareVersions(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
