import { describe, expect, it } from "vitest";
import { extractMentionIds, mentionMarkdown, parseMentionHref } from "./mention-utils.ts";

describe("parseMentionHref", () => {
  it("reads a plain mention", () => {
    expect(parseMentionHref("mention:abc-123")).toEqual({ entityId: "abc-123" });
  });

  it("reads a block of a page", () => {
    expect(parseMentionHref("mention:abc-123#blk_9f2")).toEqual({
      entityId: "abc-123",
      blockId: "blk_9f2",
    });
  });

  it("reads a page of a file", () => {
    expect(parseMentionHref("mention:abc-123#p12")).toEqual({ entityId: "abc-123", page: 12 });
  });

  it("does not take a block id that merely starts with p for a page", () => {
    expect(parseMentionHref("mention:abc-123#p12x")).toEqual({
      entityId: "abc-123",
      blockId: "p12x",
    });
    expect(parseMentionHref("mention:abc-123#page")).toEqual({
      entityId: "abc-123",
      blockId: "page",
    });
  });

  it("is null for other links", () => {
    expect(parseMentionHref("https://example.com")).toBeNull();
    expect(parseMentionHref("mention:")).toBeNull();
  });
});

describe("mentions of a page of a file", () => {
  it("still count as a mention of the file", () => {
    expect(extractMentionIds("See [Slides (p. 3)](mention:f1#p3) and [x](mention:f2).")).toEqual([
      "f1",
      "f2",
    ]);
  });

  it("builds the plain markdown form", () => {
    expect(mentionMarkdown("Slides", "f1")).toBe("[Slides](mention:f1)");
  });
});
