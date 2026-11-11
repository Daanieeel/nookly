import { describe, expect, it } from "vitest";
import type { MoodleFile } from "#/lib/api/moodle.ts";
import { matchCourse, originOf, suggestLabelNames, suggestTitles } from "./moodle-import.ts";

const file = (over: Partial<MoodleFile> = {}): MoodleFile => ({
  kind: "file",
  fileName: "lecture1.pdf",
  filePath: "/",
  fileSize: 10,
  fileUrl: "https://moodle.uni.edu/pluginfile.php/1/mod_resource/content/2/lecture1.pdf",
  timeModified: 5,
  mimeType: "application/pdf",
  ...over,
});

describe("originOf", () => {
  it("names the file by where it lives on the site", () => {
    expect(originOf(file())).toBe(
      "moodle:https://moodle.uni.edu/pluginfile.php/1/mod_resource/content/2/lecture1.pdf",
    );
  });

  it("ignores the query, so a download link and a view link are one file", () => {
    expect(
      originOf(
        file({
          fileUrl: "https://m.edu/pluginfile.php/1/a.pdf?forcedownload=1",
        }),
      ),
    ).toBe(originOf(file({ fileUrl: "https://m.edu/pluginfile.php/1/a.pdf" })));
  });
});

describe("suggestTitles", () => {
  it("offers the item's name with the file's extension first, then the file's own name", () => {
    expect(suggestTitles(file(), "Lecture 1 slides")).toEqual([
      "Lecture 1 slides.pdf",
      "lecture1.pdf",
    ]);
  });

  it("does not repeat an extension the item name already has", () => {
    expect(suggestTitles(file(), "Lecture 1.pdf")).toEqual(["Lecture 1.pdf", "lecture1.pdf"]);
  });

  it("offers only the file name when there is no item name or it says the same", () => {
    expect(suggestTitles(file())).toEqual(["lecture1.pdf"]);
    expect(suggestTitles(file(), "lecture1")).toEqual(["lecture1.pdf"]);
  });

  it("keeps a slash out of the name", () => {
    expect(suggestTitles(file(), "Intro / Basics")[0]).toBe("Intro Basics.pdf");
  });
});

describe("suggestLabelNames", () => {
  it("suggests the course, then the section", () => {
    expect(suggestLabelNames({ shortName: "MA1", fullName: "Maths 1" }, "Week 1")).toEqual([
      "MA1",
      "Week 1",
    ]);
  });

  it("falls back to the full name, and leaves out a section that is the course or empty", () => {
    expect(suggestLabelNames({ shortName: "", fullName: "Maths 1" }, "Maths 1")).toEqual([
      "Maths 1",
    ]);
    expect(suggestLabelNames({ shortName: "MA1", fullName: "Maths 1" }, "  ")).toEqual(["MA1"]);
  });
});

describe("matchCourse", () => {
  const courses = [
    { id: "c1", title: "History" },
    { id: "c2", title: "maths 1" },
  ];

  it("finds the course of Nookly with the same name, ignoring case", () => {
    expect(matchCourse(courses, { shortName: "MA1", fullName: "Maths 1" })?.id).toBe("c2");
    expect(matchCourse(courses, { shortName: "history", fullName: "World" })?.id).toBe("c1");
  });

  it("finds nothing rather than guessing", () => {
    expect(matchCourse(courses, { shortName: "PH1", fullName: "Physics" })).toBeUndefined();
  });
});
