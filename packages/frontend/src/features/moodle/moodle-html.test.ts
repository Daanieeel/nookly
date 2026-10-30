import { describe, expect, it } from "vitest";
import { cleanMoodleHtml, hasMoodleText } from "./moodle-html.ts";

describe("cleanMoodleHtml", () => {
  it("keeps ordinary formatting", () => {
    const html = "<p>Read <strong>chapter 2</strong></p><ul><li>one</li></ul>";
    expect(cleanMoodleHtml(html)).toBe(html);
  });

  it("removes scripts, handlers, frames, styles and forms", () => {
    const dirty =
      '<p onclick="x()">Hi</p><script>alert(1)</script><iframe src="https://evil"></iframe>' +
      '<style>p{}</style><form action="https://evil"><input name="a"></form><object data="x"></object>';
    const clean = cleanMoodleHtml(dirty);
    expect(clean).toBe("<p>Hi</p>");
  });

  it("only lets web and mail links through, opened outside the app", () => {
    const clean = cleanMoodleHtml(
      '<a href="https://uni.edu/x">ok</a><a href="javascript:alert(1)">bad</a><a href="file:///etc/passwd">file</a>',
    );
    expect(clean).toContain('href="https://uni.edu/x"');
    expect(clean).toContain('rel="noopener noreferrer"');
    expect(clean).toContain('target="_blank"');
    expect(clean).not.toContain("javascript:");
    expect(clean).not.toContain("file:");
  });

  it("swaps an image for its description", () => {
    expect(
      cleanMoodleHtml('<p>See <img src="https://x/pluginfile.php/a.png" alt="the graph"></p>'),
    ).toBe("<p>See [the graph]</p>");
    expect(cleanMoodleHtml('<p>A<img src="x">B</p>')).toBe("<p>AB</p>");
  });

  it("drops the plugin file placeholder", () => {
    expect(cleanMoodleHtml('<a href="@@PLUGINFILE@@/a.pdf">a</a>')).not.toContain("PLUGINFILE");
  });
});

describe("hasMoodleText", () => {
  it("is false for what Moodle sends for nothing", () => {
    for (const empty of ["", null, undefined, "<p><br></p>", "<div> </div>"]) {
      expect(hasMoodleText(empty)).toBe(false);
    }
    expect(hasMoodleText("<p>Hello</p>")).toBe(true);
  });
});
