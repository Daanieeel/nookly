import { describe, expect, it } from "vitest";
import { buildGroups } from "#/components/grouped-view/grouping.ts";
import { preferences } from "#/lib/preferences.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { makeFile } from "#/test/fixtures.ts";
import { freezeTime, setDateTimeSettings } from "#/test/time.ts";
import {
  fileExtension,
  fileKind,
  filePath,
  isLinkOnly,
  isReference,
  officeFormat,
} from "./file-kind.ts";
import { fileGroupDefs, orderFiles, readDisplay, writeDisplay } from "./file-model.ts";

const DEFAULTS = { layout: "grid", grouping: "none", ordering: "newest" };
const ids = (items: { entity: { id: string } }[]) => items.map((f) => f.entity.id);

describe("readDisplay", () => {
  it("reads the defaults when nothing is saved", () => {
    expect(readDisplay()).toEqual(DEFAULTS);
  });

  it("reads back what was written", () => {
    writeDisplay({ layout: "list", grouping: "kind", ordering: "name" });
    expect(readDisplay()).toEqual({ layout: "list", grouping: "kind", ordering: "name" });
  });

  it("falls back for an unreadable value", () => {
    preferences.set(STORAGE_KEYS.filesDisplay, "garbage");
    expect(readDisplay()).toEqual(DEFAULTS);
  });

  it("falls back field by field", () => {
    preferences.set(
      STORAGE_KEYS.filesDisplay,
      JSON.stringify({ grouping: "site", ordering: "oldest" }),
    );
    expect(readDisplay()).toEqual({ ...DEFAULTS, ordering: "oldest" });
  });
});

describe("orderFiles", () => {
  const files = [
    makeFile({}, { id: "b", title: "b.pdf", createdAt: "2026-02-01T00:00:00Z" }),
    makeFile({}, { id: "a", title: "a.pdf", createdAt: "2026-03-01T00:00:00Z" }),
    makeFile({}, { id: "c", title: "c.pdf", createdAt: "2026-01-01T00:00:00Z" }),
  ];

  it("orders newest, oldest and by name", () => {
    expect(ids(orderFiles(files, "newest"))).toEqual(["a", "b", "c"]);
    expect(ids(orderFiles(files, "oldest"))).toEqual(["c", "b", "a"]);
    expect(ids(orderFiles(files, "name"))).toEqual(["a", "b", "c"]);
  });
});

describe("file kinds", () => {
  it("reads the extension from the original name, ignoring case", () => {
    expect(fileExtension(makeFile({ localPath: "/x", originalFilename: "Notes.PDF" }))).toBe("pdf");
  });

  it("falls back to the title for the extension", () => {
    expect(fileExtension(makeFile({ localPath: "/x" }, { title: "photo.jpeg" }))).toBe("jpeg");
  });

  it("finds no extension in a dotfile or a plain name", () => {
    expect(fileExtension(makeFile({ localPath: "/x", originalFilename: ".env" }))).toBeNull();
    expect(fileExtension(makeFile({ localPath: "/x", originalFilename: "README" }))).toBeNull();
  });

  it("names the kind by extension", () => {
    const kindOf = (name: string) =>
      fileKind(makeFile({ localPath: "/x", originalFilename: name })).id;
    expect(kindOf("a.png")).toBe("image");
    expect(kindOf("a.pdf")).toBe("pdf");
    expect(kindOf("a.docx")).toBe("document");
    expect(kindOf("a.csv")).toBe("sheet");
    expect(kindOf("a.key")).toBe("slides");
    expect(kindOf("a.zip")).toBe("archive");
    expect(kindOf("a.flac")).toBe("audio");
    expect(kindOf("a.mkv")).toBe("video");
    expect(kindOf("a.rs")).toBe("code");
    expect(kindOf("a.xyz")).toBe("other");
  });

  it("tells links, references and stored copies apart", () => {
    const link = makeFile({ url: "https://drive.google.com/x", provider: "google_drive" });
    const reference = makeFile({ sourcePath: "/Users/me/a.pdf" });
    const stored = makeFile({ localPath: "/store/a.pdf", sourcePath: "/Users/me/a.pdf" });
    expect(isLinkOnly(link)).toBe(true);
    expect(fileKind(link).id).toBe("google_drive");
    expect(fileKind(makeFile({ url: "https://x.com/a.pdf" })).id).toBe("link");
    expect(fileExtension(link)).toBeNull();
    expect(isReference(reference)).toBe(true);
    expect(isReference(stored)).toBe(false);
    expect(filePath(stored)).toBe("/store/a.pdf");
    expect(filePath(reference)).toBe("/Users/me/a.pdf");
    expect(filePath(link)).toBeNull();
  });

  it("knows how the viewer opens office files", () => {
    const formatOf = (name: string) =>
      officeFormat(makeFile({ localPath: "/x", originalFilename: name }));
    expect(formatOf("a.docx")).toBe("docx");
    expect(formatOf("a.xlsm")).toBe("xlsx");
    expect(formatOf("a.pptx")).toBe("convert");
    expect(formatOf("a.pdf")).toBeNull();
  });
});

describe("fileGroupDefs", () => {
  it("has no groups without a grouping", () => {
    expect(fileGroupDefs("none")).toBeNull();
  });

  it("groups by kind", () => {
    const files = [
      makeFile({ localPath: "/x", originalFilename: "a.pdf" }, { id: "pdf" }),
      makeFile({ localPath: "/x", originalFilename: "a.png" }, { id: "png" }),
    ];
    const groups = buildGroups(files, fileGroupDefs("kind") ?? [], null).filter(
      (g) => g.items.length > 0,
    );
    expect(groups.map((g) => [g.name, ids(g.items)])).toEqual([
      ["Image", ["png"]],
      ["PDF", ["pdf"]],
    ]);
  });

  it("groups by when they were added, each file in its first matching bucket", () => {
    // A Wednesday in May.
    freezeTime("2026-05-13T12:00:00");
    setDateTimeSettings({ dateFormat: "european" });
    const files = [
      makeFile({}, { id: "today", createdAt: "2026-05-13T08:00:00Z" }),
      makeFile({}, { id: "yesterday", createdAt: "2026-05-12T08:00:00Z" }),
      makeFile({}, { id: "monday", createdAt: "2026-05-11T08:00:00Z" }),
      makeFile({}, { id: "month", createdAt: "2026-05-02T08:00:00Z" }),
      makeFile({}, { id: "april", createdAt: "2026-04-20T08:00:00Z" }),
      makeFile({}, { id: "march", createdAt: "2026-03-20T08:00:00Z" }),
      makeFile({}, { id: "january", createdAt: "2026-01-02T08:00:00Z" }),
      makeFile({}, { id: "2024", createdAt: "2024-07-01T08:00:00Z" }),
      makeFile({}, { id: "ancient", createdAt: "2001-07-01T08:00:00Z" }),
    ];
    const groups = buildGroups(files, fileGroupDefs("added") ?? [], null).filter(
      (g) => g.items.length > 0,
    );
    expect(groups.map((g) => [g.name, ids(g.items)])).toEqual([
      ["Today", ["today"]],
      ["Yesterday", ["yesterday"]],
      ["This week", ["monday"]],
      ["This month", ["month"]],
      ["Last month", ["april"]],
      ["March", ["march"]],
      ["January", ["january"]],
      ["2024", ["2024"]],
      ["Earlier", ["ancient"]],
    ]);
  });

  it("lists every earlier month of this year and the last five years", () => {
    freezeTime("2026-05-13T12:00:00");
    const names = (fileGroupDefs("added") ?? []).map((d) => d.name);
    expect(names).toEqual([
      "Today",
      "Yesterday",
      "This week",
      "This month",
      "Last month",
      "March",
      "February",
      "January",
      "2025",
      "2024",
      "2023",
      "2022",
      "2021",
      "Earlier",
    ]);
  });

  it("starts the week on Sunday in the American format", () => {
    // Sunday the 10th is in this week only when weeks start on Sunday.
    freezeTime("2026-05-13T12:00:00");
    const files = [makeFile({}, { id: "sunday", createdAt: "2026-05-10T08:00:00Z" })];
    setDateTimeSettings({ dateFormat: "american" });
    const american = buildGroups(files, fileGroupDefs("added") ?? [], null);
    setDateTimeSettings({ dateFormat: "european" });
    const european = buildGroups(files, fileGroupDefs("added") ?? [], null);
    expect(american.find((g) => g.items.length > 0)?.id).toBe("week");
    expect(european.find((g) => g.items.length > 0)?.id).toBe("month");
  });
});
