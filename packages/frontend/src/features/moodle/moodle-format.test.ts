import { describe, expect, it } from "vitest";
import {
  dueTone,
  fileTypeLabel,
  firstNameOf,
  moduleKindLabel,
  fileSize,
  gradingLabel,
  moodleDate,
  percentOf,
  submissionLabel,
} from "./moodle-format.ts";

describe("moodle formats", () => {
  it("has no date for zero", () => {
    expect(moodleDate(0)).toBeNull();
    expect(moodleDate(-1)).toBeNull();
    expect(moodleDate(1_700_000_000)).toMatch(/2023/);
  });

  it("writes sizes", () => {
    expect(fileSize(12)).toBe("12 B");
    expect(fileSize(2048)).toBe("2 KB");
    expect(fileSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("names the submission and grading states", () => {
    expect(submissionLabel("submitted")).toBe("Submitted");
    expect(submissionLabel(null)).toBe("Not submitted");
    expect(submissionLabel("something new")).toBe("Not submitted");
    expect(gradingLabel("graded")).toBe("Graded");
    expect(gradingLabel("odd")).toBeNull();
    expect(gradingLabel(null)).toBeNull();
  });
});

describe("dueTone", () => {
  const now = 1_000_000;
  const day = 86_400;
  it("tells what needs attention", () => {
    expect(dueTone(0, now)).toBe("none");
    expect(dueTone(now - 60, now)).toBe("overdue");
    expect(dueTone(now + 2 * day, now)).toBe("soon");
    expect(dueTone(now + 3 * day, now)).toBe("soon");
    expect(dueTone(now + 10 * day, now)).toBe("later");
  });
});

describe("percentOf", () => {
  it("reads the percentages Moodle writes in the site's language", () => {
    expect(percentOf("85,50 %")).toBe(85.5);
    expect(percentOf("72.5 %")).toBe(72.5);
    expect(percentOf("100 %")).toBe(100);
  });
  it("is nothing for a grade without one, and stays within the bar", () => {
    expect(percentOf(null)).toBeNull();
    expect(percentOf("-")).toBeNull();
    expect(percentOf("")).toBeNull();
    expect(percentOf("130 %")).toBe(100);
    expect(percentOf("-5 %")).toBe(0);
  });
});

describe("firstNameOf", () => {
  it("takes the first name from a name written either way round", () => {
    expect(firstNameOf("Ada Lovelace")).toBe("Ada");
    // Many Moodle sites write the surname first, with a comma.
    expect(firstNameOf("Dopatka, Daniel")).toBe("Daniel");
    expect(firstNameOf("Dopatka, Daniel Max")).toBe("Daniel");
    expect(firstNameOf("  Ada   Lovelace ")).toBe("Ada");
  });
  it("has none for no name", () => {
    expect(firstNameOf(null)).toBeNull();
    expect(firstNameOf("")).toBeNull();
    expect(firstNameOf("  ,  ")).toBeNull();
  });
});

describe("fileTypeLabel", () => {
  it("names a file's type by its extension", () => {
    expect(fileTypeLabel("Slides.PDF")).toBe("PDF");
    expect(fileTypeLabel("notes.tar.gz")).toBe("GZ");
    expect(fileTypeLabel("README")).toBe("File");
    expect(fileTypeLabel("")).toBe("File");
  });
});

describe("moduleKindLabel", () => {
  it("says what kind of item Moodle holds, in words", () => {
    expect(moduleKindLabel("assign")).toBe("Assignment");
    expect(moduleKindLabel("forum")).toBe("Forum");
    expect(moduleKindLabel("folder")).toBe("Folder");
    expect(moduleKindLabel("quiz")).toBe("Quiz");
    // One Nookly doesn't know is still named, from Moodle's own word for it.
    expect(moduleKindLabel("bigbluebuttonbn")).toBe("Bigbluebuttonbn");
  });
});
