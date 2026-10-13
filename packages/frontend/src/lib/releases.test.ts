import { describe, expect, it } from "vitest";
import { MAX_RELEASES, allReleases, releasesSince } from "./releases.ts";

const entry = (version: string) => ({
  version,
  date: "2026-01-02",
  title: `Release ${version}`,
  summary: "S",
  highlights: [],
  more: {},
});

const NOTES = {
  versions: [entry("0.32.0"), entry("0.31.10"), entry("0.30.2"), entry("0.29.0")],
};

const CHANGELOG = `# Changelog

## 0.32.0 (2026-10-10)

### Added

- In both

## 0.31.5 (2026-09-20)

### Added

- Only in the changelog

## 0.28.0 (2026-05-01)

### Added

- Old
`;

const versions = (since: string | null, running: string, notes = NOTES, changelog = CHANGELOG) =>
  releasesSince(since, running, notes, changelog).releases.map((r) => r.version);

describe("releasesSince", () => {
  it("is every release after the one last seen, up to the one running, newest first", () => {
    expect(versions("0.30.2", "0.32.0")).toEqual(["0.32.0", "0.31.10", "0.31.5"]);
  });

  it("leaves out the version last seen and anything newer than the one running", () => {
    expect(versions("0.31.10", "0.32.0")).toEqual(["0.32.0"]);
    expect(versions("0.29.0", "0.31.10")).toEqual(["0.31.10", "0.31.5", "0.30.2"]);
  });

  it("counts a release that exists only in the changelog, and one only in the notes", () => {
    const releases = releasesSince("0.30.2", "0.32.0", NOTES, CHANGELOG).releases;
    expect(releases.find((r) => r.version === "0.31.5")?.written?.body).toContain(
      "Only in the changelog",
    );
    expect(releases.find((r) => r.version === "0.31.5")?.notes).toBeUndefined();
    expect(releases.find((r) => r.version === "0.31.10")?.notes?.title).toBe("Release 0.31.10");
  });

  it("prefers the written up notes when a version has both, and keeps the date", () => {
    const release = releasesSince("0.31.10", "0.32.0", NOTES, CHANGELOG).releases[0];
    expect(release?.notes?.title).toBe("Release 0.32.0");
    expect(release?.date).toBe("2026-01-02");
  });

  it("is only the running version when there is nothing to compare with", () => {
    expect(versions(null, "0.32.0")).toEqual(["0.32.0"]);
    expect(versions(null, "0.31.5")).toEqual(["0.31.5"]);
  });

  it("is only the running version when the last seen one is not older", () => {
    expect(versions("0.32.0", "0.32.0")).toEqual(["0.32.0"]);
    expect(versions("0.33.0", "0.32.0")).toEqual(["0.32.0"]);
  });

  it("is empty for a running version nobody wrote about", () => {
    expect(releasesSince(null, "9.9.9", NOTES, CHANGELOG)).toEqual({ releases: [], hidden: 0 });
    expect(versions("0.30.2", "0.30.4")).toEqual([]);
  });

  it("stops after a great many releases and says how many it left out", () => {
    const total = MAX_RELEASES + 3;
    const many = { versions: Array.from({ length: total }, (_, i) => entry(`0.${total - i}.0`)) };
    const result = releasesSince("0.0.1", `0.${total}.0`, many, "");
    expect(result.releases).toHaveLength(MAX_RELEASES);
    expect(result.hidden).toBe(3);
    expect(result.releases[0]?.version).toBe(`0.${total}.0`);
  });

  it("lists every release from 0.18.46 on for a long jump", () => {
    const changelog = Array.from(
      { length: 60 },
      (_, i) =>
        `## 0.${18 + Math.floor(i / 10)}.${(i % 10) + 47} (2026-01-01)\n\n### Added\n\n- x\n`,
    ).join("\n");
    const result = releasesSince("0.18.46", "0.23.56", undefined, changelog);
    expect(result.releases.length + result.hidden).toBe(60);
    expect(result.hidden).toBe(0);
  });
});

describe("allReleases", () => {
  it("is every version written up in whats-new.json up to the running one, newest first", () => {
    const result = allReleases("0.31.10", NOTES);
    expect(result.map((r) => r.version)).toEqual(["0.31.10", "0.30.2", "0.29.0"]);
    expect(result.every((r) => r.notes)).toBe(true);
  });

  it("leaves out versions only in the changelog", () => {
    expect(allReleases("0.32.0", NOTES).map((r) => r.version)).not.toContain("0.31.5");
  });

  it("does not stop at the cap of one dialog", () => {
    const total = MAX_RELEASES + 3;
    const many = { versions: Array.from({ length: total }, (_, i) => entry(`0.${total - i}.0`)) };
    expect(allReleases(`0.${total}.0`, many)).toHaveLength(total);
  });
});
