import { describe, expect, it } from "vitest";
import { fileUrl, isLocalPath, mediaTargetError, parseMediaTarget } from "./media-target";

describe("isLocalPath", () => {
  it.each([
    "/Users/daniel/Downloads/Handout_Woche3.pdf",
    "C:\\Users\\me\\a.pdf",
    "c:/Users/me/a.pdf",
    "\\\\server\\share\\a.pdf",
    "  /Users/me/a.pdf ",
  ])("takes %s for a full path", (text) => {
    expect(isLocalPath(text)).toBe(true);
  });

  it.each([
    "",
    "a.pdf",
    "./a.pdf",
    "~/a.pdf",
    "https://x.dev/a.pdf",
    "file:///a.pdf",
    "//x/a",
    "C:a",
  ])("does not take %s for a full path", (text) => {
    expect(isLocalPath(text)).toBe(false);
  });
});

describe("parseMediaTarget", () => {
  it("tells a mention, a link, a path, nothing and the rest apart", () => {
    expect(parseMediaTarget("[a.pdf](mention:f-1)")).toEqual({
      kind: "mention",
      label: "a.pdf",
      fileId: "f-1",
    });
    expect(parseMediaTarget("https://x.dev/talk.mp4")).toEqual({
      kind: "url",
      url: "https://x.dev/talk.mp4",
    });
    expect(parseMediaTarget(" /Users/me/Uni/a.pdf ")).toEqual({
      kind: "path",
      path: "/Users/me/Uni/a.pdf",
      name: "a.pdf",
    });
    expect(parseMediaTarget("C:\\Uni\\Handout.pdf")).toEqual({
      kind: "path",
      path: "C:\\Uni\\Handout.pdf",
      name: "Handout.pdf",
    });
    expect(parseMediaTarget("  ")).toEqual({ kind: "empty" });
    expect(parseMediaTarget("notes.pdf")).toEqual({ kind: "invalid" });
  });
});

describe("mediaTargetError", () => {
  it("accepts a link and a full path", () => {
    expect(mediaTargetError("https://x.dev/a.pdf")).toBeNull();
    expect(mediaTargetError("/Users/me/a.pdf")).toBeNull();
    expect(mediaTargetError("C:\\Users\\me\\a.pdf")).toBeNull();
  });

  it("asks for something when the field is empty", () => {
    expect(mediaTargetError("")).toBe("Enter the full path of a file, or a link.");
    expect(mediaTargetError("   ")).toBe("Enter the full path of a file, or a link.");
  });

  it("says what a path or link looks like when the value is neither", () => {
    const message =
      "That is not a full path or a link. A path starts with / or a drive letter like C:\\, a link with https://.";
    expect(mediaTargetError("Handout.pdf")).toBe(message);
    expect(mediaTargetError("~/Handout.pdf")).toBe(message);
    expect(mediaTargetError("ftp://x.dev/a")).toBe(message);
    expect(mediaTargetError("https://")).toBe(message);
  });
});

describe("fileUrl", () => {
  it("turns a path into a file link", () => {
    expect(fileUrl("/Users/ada/My Files/cat.png")).toBe("file:///Users/ada/My%20Files/cat.png");
    expect(fileUrl("C:\\Uni\\a.pdf")).toBe("file:///C:/Uni/a.pdf");
  });
});
