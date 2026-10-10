import { describe, expect, it } from "vitest";
import { makeFile } from "#/test/fixtures.ts";
import { hasPages } from "./file-kind.ts";

const named = (filename: string) =>
  makeFile({ localPath: `/files/${filename}`, originalFilename: filename });

describe("hasPages", () => {
  it.each([
    "a.pdf",
    "A.PDF",
    "slides.pptx",
    "slides.key",
    "old.ppt",
    "talk.odp",
    "essay.odt",
    "memo.doc",
    "text.rtf",
    "book.pages",
  ])("is true for %s, which the viewer shows page by page", (filename) => {
    expect(hasPages(named(filename))).toBe(true);
  });

  it.each([
    "photo.png",
    "clip.mp4",
    "song.mp3",
    "data.csv",
    "notes.txt",
    "code.ts",
    "sheet.xlsx",
    "sheet.xls",
    "sheet.ods",
    "sheet.numbers",
    "report.docx",
    "archive.zip",
    "noextension",
  ])("is false for %s", (filename) => {
    expect(hasPages(named(filename))).toBe(false);
  });

  it("is false for a link with no stored copy", () => {
    expect(hasPages(makeFile({ url: "https://example.com/a.pdf" }))).toBe(false);
  });
});
