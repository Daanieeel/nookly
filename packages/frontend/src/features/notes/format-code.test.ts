import { describe, expect, it } from "vitest";
import { canFormat, formatCode } from "./format-code";

describe("canFormat", () => {
  it("is true for the languages a formatter exists for, by name or alias", () => {
    for (const language of [
      "javascript",
      "js",
      "jsx",
      "typescript",
      "ts",
      "tsx",
      "json",
      "jsonc",
      "css",
      "html",
      "markdown",
      "yaml",
    ]) {
      expect(canFormat(language), language).toBe(true);
    }
  });

  it("is false for plain text, no language and languages without a formatter", () => {
    for (const language of [null, "", "plaintext", "rust", "python", "go", "bash", "sql", "nope"]) {
      expect(canFormat(language), String(language)).toBe(false);
    }
  });
});

describe("formatCode", () => {
  it("formats JavaScript", async () => {
    expect(
      await formatCode("const a={b:1,c:[1,2]}\nfunction f( x ){return x+1}", "javascript"),
    ).toBe("const a = { b: 1, c: [1, 2] };\nfunction f(x) {\n  return x + 1;\n}\n".trimEnd());
  });

  it("formats TypeScript, also under its short name", async () => {
    const code = "interface A{a:string;b?:number}";
    const expected = "interface A {\n  a: string;\n  b?: number;\n}";
    expect(await formatCode(code, "typescript")).toBe(expected);
    expect(await formatCode(code, "ts")).toBe(expected);
  });

  it("formats JSON, JSONC, CSS, YAML and Markdown", async () => {
    expect(await formatCode('{"a":1,"b":[1,2,{"c":null}]}', "json")).toBe(
      '{ "a": 1, "b": [1, 2, { "c": null }] }',
    );
    expect(await formatCode('{"a":1, // note\n"b":2}', "jsonc")).toContain("// note");
    expect(await formatCode("a{color:red;margin:0}", "css")).toBe(
      "a {\n  color: red;\n  margin: 0;\n}",
    );
    expect(await formatCode("a:   1\nb:\n    - x\n    -   y", "yaml")).toBe(
      "a: 1\nb:\n  - x\n  - y",
    );
    expect(await formatCode("# Title\n\n\n*  item", "markdown")).toBe("# Title\n\n- item");
  });

  it("formats JSX and TSX", async () => {
    expect(await formatCode("const a=<div className='x'>hi</div>", "jsx")).toBe(
      'const a = <div className="x">hi</div>;',
    );
    expect(await formatCode("const a=<div>{x as number}</div>", "tsx")).toBe(
      "const a = <div>{x as number}</div>;",
    );
  });

  it("leaves the code alone (null) when it cannot be parsed", async () => {
    expect(await formatCode("const a = {", "javascript")).toBeNull();
    expect(await formatCode("{not json", "json")).toBeNull();
  });

  it("leaves the code alone (null) for a language without a formatter", async () => {
    expect(await formatCode("fn main(){}", "rust")).toBeNull();
    expect(await formatCode("x = 1", null)).toBeNull();
  });

  it("gives back nothing to change for code that is formatted already", async () => {
    expect(await formatCode("const a = 1;", "javascript")).toBe("const a = 1;");
  });

  it("drops the final newline Prettier adds, since a code block has none", async () => {
    expect((await formatCode("a=1", "javascript"))?.endsWith("\n")).toBe(false);
  });
});
