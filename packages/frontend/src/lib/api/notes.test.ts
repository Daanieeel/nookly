import { afterEach, describe, expect, it } from "vitest";
import { settings } from "#/lib/settings/settings.ts";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { exportPageMarkdown, renderPageMarkdown } from "./notes.ts";

afterEach(() => settings.set("notes.latexMacros", ""));

// #122: a copy or file of a page that uses the user's LaTeX commands defines them, so the
// page does not break where those commands do not exist.
describe("page markdown with the user's LaTeX commands", () => {
  const macros = "\\newcommand{\\N}{\\mathbb{N}}";

  it("is the page as it is while no command is defined or used", async () => {
    mockCommand("render_page_markdown", "Let $x \\in \\N$.");
    expect(await renderPageMarkdown("n1")).toBe("Let $x \\in \\N$.");
    settings.set("notes.latexMacros", macros);
    mockCommand("render_page_markdown", "No math here.");
    expect(await renderPageMarkdown("n1")).toBe("No math here.");
  });

  it("starts with a math block defining the commands the page uses", async () => {
    settings.set("notes.latexMacros", macros);
    mockCommand("render_page_markdown", "Let $x \\in \\N$.");
    expect(await renderPageMarkdown("n1")).toBe(
      "$$\n\\newcommand{\\N}{\\mathbb{N}}\n$$\n\nLet $x \\in \\N$.",
    );
  });

  it("hands the same block to the file export", async () => {
    settings.set("notes.latexMacros", macros);
    mockCommand("render_page_markdown", "Let $x \\in \\N$.");
    mockCommand("export_page_markdown", null);
    await exportPageMarkdown("n1", "/tmp/a.md");
    expect(callsOf("export_page_markdown")[0]).toEqual({
      entityId: "n1",
      path: "/tmp/a.md",
      preamble: "$$\n\\newcommand{\\N}{\\mathbb{N}}\n$$",
    });
  });

  it("hands over no block when the page uses none of the commands", async () => {
    settings.set("notes.latexMacros", macros);
    mockCommand("render_page_markdown", "Nothing special.");
    mockCommand("export_page_markdown", null);
    await exportPageMarkdown("n1", "/tmp/a.md");
    expect(callsOf("export_page_markdown")[0]).toMatchObject({ preamble: null });
  });
});
