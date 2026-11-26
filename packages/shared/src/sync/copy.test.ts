import { describe, expect, it } from "vitest";
import { filesDetail, heldLine, migrationSummary } from "./copy.ts";
import type { MigrationState } from "./runtime.ts";

const DONE: MigrationState = {
  phase: "done",
  items: 1204,
  itemsSent: 1204,
  files: 37,
  filesSent: 37,
  backupPath: null,
  startedAt: "2026-10-14T10:00:00.000Z",
  finishedAt: "2026-10-14T10:05:00.000Z",
  error: null,
};

describe("what a person reads about changes that couldn't sync", () => {
  it("says they are safe and tried again", () => {
    expect(heldLine(1, "this computer")).toBe(
      "1 change couldn't sync yet. It's saved on this computer and Nookly keeps trying.",
    );
    expect(heldLine(2, "this iPad")).toBe(
      "2 changes couldn't sync yet. They're saved on this iPad and Nookly keeps trying.",
    );
  });
});

describe("the end of a first sync", () => {
  it("says everything is in the account", () => {
    expect(migrationSummary(DONE, "this computer")).toBe(
      "All 1,204 items and 37 files are in your account, checked with the server.",
    );
  });

  it("doesn't claim everything when some of it waits", () => {
    expect(migrationSummary({ ...DONE, itemsSent: 1202, heldItems: 2 }, "this computer")).toBe(
      "1,202 of 1,204 items and 37 files are in your account, checked with the server. 2 changes couldn't sync yet. They're saved on this computer and Nookly keeps trying.",
    );
  });
});

describe("how far the files of a first sync are", () => {
  it("counts files and bytes", () => {
    expect(
      filesDetail({
        ...DONE,
        filesSent: 12,
        fileBytes: 480 * 1048576,
        fileBytesSent: 120 * 1048576,
      }),
    ).toBe("12 of 37 files, 120.0 MB of 480.0 MB");
  });

  it("counts files alone for a sync an earlier version started", () => {
    expect(filesDetail({ ...DONE, filesSent: 12 })).toBe("12 of 37 files");
  });
});
