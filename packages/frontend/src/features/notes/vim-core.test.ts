import { describe, expect, it } from "vitest";
import { firstNonBlank, nextWordStart, prevWordStart, wordEnd, wordObject } from "./vim-core";

const TEXT = "foo bar.baz  qux";
//            0123456789012345

describe("nextWordStart (w)", () => {
  it("jumps to the start of the next word, punctuation counting as a word", () => {
    expect(nextWordStart(TEXT, 0)).toBe(4);
    expect(nextWordStart(TEXT, 4)).toBe(7);
    expect(nextWordStart(TEXT, 7)).toBe(8);
    expect(nextWordStart(TEXT, 8)).toBe(13);
  });

  it("starts from the middle of a word", () => {
    expect(nextWordStart(TEXT, 1)).toBe(4);
  });

  it("is the end of the text from the last word", () => {
    expect(nextWordStart(TEXT, 13)).toBe(TEXT.length);
    expect(nextWordStart("", 0)).toBe(0);
  });
});

describe("prevWordStart (b)", () => {
  it("jumps to the start of the current or previous word", () => {
    expect(prevWordStart(TEXT, 13)).toBe(8);
    expect(prevWordStart(TEXT, 10)).toBe(8);
    expect(prevWordStart(TEXT, 8)).toBe(7);
    expect(prevWordStart(TEXT, 7)).toBe(4);
    expect(prevWordStart(TEXT, 4)).toBe(0);
  });

  it("stays at the start", () => {
    expect(prevWordStart(TEXT, 0)).toBe(0);
  });
});

describe("wordEnd (e)", () => {
  it("jumps to the last character of the current or next word", () => {
    expect(wordEnd(TEXT, 0)).toBe(2);
    expect(wordEnd(TEXT, 2)).toBe(6);
    expect(wordEnd(TEXT, 3)).toBe(6);
    expect(wordEnd(TEXT, 6)).toBe(7);
    expect(wordEnd(TEXT, 8)).toBe(10);
  });

  it("stops at the last character of the text", () => {
    expect(wordEnd(TEXT, 14)).toBe(15);
    expect(wordEnd(TEXT, 15)).toBe(15);
  });
});

describe("firstNonBlank (^)", () => {
  it("is the first character that is not a space", () => {
    expect(firstNonBlank("   abc")).toBe(3);
    expect(firstNonBlank("abc")).toBe(0);
    expect(firstNonBlank("    ")).toBe(3);
    expect(firstNonBlank("")).toBe(0);
  });
});

describe("wordObject (iw, aw)", () => {
  it("iw is the run of the same kind under the cursor", () => {
    expect(wordObject(TEXT, 1, false)).toEqual([0, 3]);
    expect(wordObject(TEXT, 3, false)).toEqual([3, 4]);
    expect(wordObject(TEXT, 7, false)).toEqual([7, 8]);
    expect(wordObject(TEXT, 11, false)).toEqual([11, 13]);
  });

  it("aw adds the space after the word, or before it for the last word", () => {
    expect(wordObject(TEXT, 1, true)).toEqual([0, 4]);
    expect(wordObject(TEXT, 14, true)).toEqual([11, 16]);
    expect(wordObject("one", 1, true)).toEqual([0, 3]);
  });

  it("is empty for an empty text", () => {
    expect(wordObject("", 0, false)).toEqual([0, 0]);
  });
});
