import { describe, expect, it } from "vitest";
import { previewLines } from "./note-preview";

describe("previewLines", () => {
  it("drops the markers of a highlight, with or without a colour", () => {
    expect(previewLines("a ==b== c")).toEqual(["a b c"]);
    expect(previewLines("a =={green}b== c")).toEqual(["a b c"]);
    expect(previewLines("=={pink}one== and =={blue}two==")).toEqual(["one and two"]);
  });

  it("drops the markers of a text colour", () => {
    expect(previewLines("a {red}b{/} c")).toEqual(["a b c"]);
    expect(previewLines("{blue}**one**{/} and {gray}two{/}")).toEqual(["one and two"]);
  });

  it("keeps braces that are not a text colour", () => {
    expect(previewLines("a {chartreuse}b{/} {x}")).toEqual(["a {chartreuse}b{/} {x}"]);
  });

  it("keeps a plain == in text", () => {
    expect(previewLines("if a == b then c")).toEqual(["if a == b then c"]);
  });
});
