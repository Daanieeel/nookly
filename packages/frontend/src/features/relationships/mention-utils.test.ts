import { describe, expect, it } from "vitest";
import {
  extractMentionIds,
  isEntityKey,
  mentionMarkdown,
  parseMentionHref,
  tablePartFragment,
} from "./mention-utils.ts";

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

describe("isEntityKey", () => {
  it.each(["JOT-12", "NOT-4", "tsk-1", "ENT-100"])("takes %s for a key", (value) => {
    expect(isEntityKey(value)).toBe(true);
  });

  it.each([
    "66fd9c8e-3d3a-403a-b29d-89b2903c3c57",
    "abc123",
    "ab-123",
    "JOT-",
    "JOT-12a",
    "JOTS-12",
    "",
  ])("does not take %s for a key", (value) => {
    expect(isEntityKey(value)).toBe(false);
  });
});

describe("a row or column of a table in a mention", () => {
  const block = "955c5287-1f00-437d-9e6a-7abb422aefdd";

  it("reads the row after the block", () => {
    expect(parseMentionHref(`mention:abc-123#${block}_r3`)).toEqual({
      entityId: "abc-123",
      blockId: block,
      row: 3,
    });
  });

  it("reads the column after the block", () => {
    expect(parseMentionHref(`mention:abc-123#${block}_c12`)).toEqual({
      entityId: "abc-123",
      blockId: block,
      column: 12,
    });
  });

  it("leaves an id that merely ends like one alone", () => {
    expect(parseMentionHref("mention:abc-123#blk_r")).toEqual({
      entityId: "abc-123",
      blockId: "blk_r",
    });
    expect(parseMentionHref("mention:abc-123#blk_r3x")).toEqual({
      entityId: "abc-123",
      blockId: "blk_r3x",
    });
    expect(parseMentionHref("mention:abc-123#_r3")).toEqual({
      entityId: "abc-123",
      blockId: "_r3",
    });
  });

  it("names a row and a column in a link to them", () => {
    expect(tablePartFragment(block, "row", 3)).toBe(`${block}_r3`);
    expect(tablePartFragment(block, "column", 1)).toBe(`${block}_c1`);
  });
});
