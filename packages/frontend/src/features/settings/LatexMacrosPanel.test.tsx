import { screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_LATEX_MACROS, serializeLatexMacros } from "#/lib/latex-macros.ts";
import { settings } from "#/lib/settings/settings.ts";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { LatexMacrosPanel } from "./LatexMacrosPanel";

const N = "\\newcommand{\\N}{\\mathbb{N}}";
const ABS = "\\newcommand{\\abs}[1]{\\left|#1\\right|}";
const saved = () => settings.get("notes.latexMacros");

beforeEach(() => settings.set("notes.latexMacros", ""));
afterEach(() => settings.set("notes.latexMacros", ""));

function rowOf(name: string) {
  const row = screen.getByText(name, { selector: "[data-macro-name]" }).closest("li");
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

describe("the macro list", () => {
  it("shows each macro as its own row with name, arguments, definition and a rendered preview", () => {
    settings.set("notes.latexMacros", `${N}\n${ABS}`);
    renderWithProviders(<LatexMacrosPanel />);
    const n = rowOf("\\N");
    expect(within(n).getByText("\\mathbb{N}")).toBeInTheDocument();
    expect(within(n).getByText("No arguments")).toBeInTheDocument();
    expect(n.querySelector(".katex")).not.toBeNull();
    const abs = rowOf("\\abs");
    expect(within(abs).getByText("1 argument")).toBeInTheDocument();
    expect(within(abs).getByText("\\left|#1\\right|")).toBeInTheDocument();
    expect(abs.querySelector(".katex")).not.toBeNull();
  });

  it("says there are no macros yet and offers to add one", () => {
    renderWithProviders(<LatexMacrosPanel />);
    expect(screen.getByText(/no macros yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add macro" })).toBeInTheDocument();
  });

  it("filters by name or definition once the list is long", async () => {
    settings.set(
      "notes.latexMacros",
      ["a", "b", "c", "d", "e", "f", "g"]
        .map((n) => `\\newcommand{\\m${n}}{\\mathrm{${n === "c" ? "needle" : n}}}`)
        .join("\n"),
    );
    const { user } = renderWithProviders(<LatexMacrosPanel />);
    const search = screen.getByRole("searchbox", { name: "Search macros" });
    await user.type(search, "needle");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(rowOf("\\mc")).toBeInTheDocument();
    await user.clear(search);
    await user.type(search, "\\mf");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    await user.clear(search);
    await user.type(search, "zzz");
    expect(screen.getByText(/no macro matches/i)).toBeInTheDocument();
  });

  it("has no search with only a few macros", () => {
    settings.set("notes.latexMacros", N);
    renderWithProviders(<LatexMacrosPanel />);
    expect(screen.queryByRole("searchbox")).toBeNull();
  });
});

describe("a macro row", () => {
  const STACK = "\\newcommand{\\zz}{\\mathrel{\\substack{z\\\\z}}}";

  it("draws its preview in full: it grows to fit and never scrolls or clips", () => {
    settings.set("notes.latexMacros", STACK);
    renderWithProviders(<LatexMacrosPanel />);
    const preview = within(rowOf("\\zz")).getByTestId("macro-preview");
    expect(preview.querySelector(".katex")).not.toBeNull();
    expect(preview.outerHTML).not.toMatch(/overflow-(x-|y-)?(auto|scroll|hidden)/);
    expect(preview.className).not.toMatch(/(^|\s)h-\d/);
  });

  it("names the command in plain monospace text, not in a field, with its arguments under it", () => {
    settings.set("notes.latexMacros", ABS);
    renderWithProviders(<LatexMacrosPanel />);
    const row = rowOf("\\abs");
    const name = within(row).getByText("\\abs", { selector: "[data-macro-name]" });
    expect(name.className).toMatch(/font-mono/);
    expect(row.querySelector("input")).toBeNull();
    expect(name.nextElementSibling).toHaveTextContent("1 argument");
  });

  it("keeps the expansion to one line, with the whole source on hover", () => {
    const long = "\\mathbb{R}".repeat(30);
    settings.set("notes.latexMacros", `\\newcommand{\\long}{${long}}`);
    renderWithProviders(<LatexMacrosPanel />);
    const expansion = within(rowOf("\\long")).getByText(long);
    expect(expansion).toHaveAttribute("title", long);
    expect(expansion.className).toMatch(/truncate/);
    expect(expansion.className).not.toMatch(/\bbg-/);
  });

  it("groups copy, edit and delete as one set of icon buttons, in a fixed order", () => {
    settings.set("notes.latexMacros", N);
    renderWithProviders(<LatexMacrosPanel />);
    const actions = within(rowOf("\\N")).getByRole("group", { name: "Actions for \\N" });
    expect(
      within(actions)
        .getAllByRole("button")
        .map((b) => b.getAttribute("aria-label")),
    ).toEqual(["Copy \\N", "Edit \\N", "Delete \\N"]);
    // Muted until hovered: the destructive colour is only on the delete icon, while hovered.
    const icon = within(actions).getByRole("button", { name: "Delete \\N" }).querySelector("svg");
    expect(icon?.getAttribute("class")).toMatch(/hover_&\]:text-destructive/);
    expect(
      within(actions)
        .getByRole("button", { name: "Edit \\N" })
        .querySelector("svg")
        ?.getAttribute("class"),
    ).not.toMatch(/destructive/);
  });
});

describe("adding a macro", () => {
  async function openForm() {
    const view = renderWithProviders(<LatexMacrosPanel />);
    await view.user.click(screen.getByRole("button", { name: "Add macro" }));
    return view;
  }
  const name = () => screen.getByRole("textbox", { name: "Command name" });
  const body = () => screen.getByRole("textbox", { name: "Definition" });
  const save = () => screen.getByRole("button", { name: "Save macro" });
  // `{` means a key to `user.type`, so a definition with braces is pasted.
  async function setBody(user: UserEvent, text: string) {
    await user.click(body());
    await user.paste(text);
  }

  it("saves the definition as a command, and shows it in the list", async () => {
    const { user } = await openForm();
    await user.type(name(), "abs");
    await setBody(user, "\\left|#1\\right|");
    await user.click(save());
    expect(saved()).toBe(ABS);
    expect(rowOf("\\abs")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Definition" })).toBeNull();
  });

  it("previews the command as it is typed, with sample arguments", async () => {
    const { user } = await openForm();
    await user.type(name(), "abs");
    await user.type(body(), "|#1|");
    const preview = await screen.findByRole("group", { name: "Preview" });
    expect(preview.querySelector(".katex")).not.toBeNull();
    expect(preview).toHaveTextContent("\\abs{x}");
    expect(screen.getByText("1 argument")).toBeInTheDocument();
  });

  it("takes a leading backslash in the name", async () => {
    const { user } = await openForm();
    await user.type(name(), "\\N");
    await setBody(user, "\\mathbb{N}");
    await user.click(save());
    expect(saved()).toBe(N);
  });

  it("fills the fields from a pasted \\newcommand", async () => {
    const { user } = await openForm();
    await user.click(name());
    await user.paste(ABS);
    expect(name()).toHaveValue("abs");
    expect(body()).toHaveValue("\\left|#1\\right|");
  });

  it.each([
    ["a name with digits", "n2", "x", /letters/i],
    ["a name that is taken", "N", "x", /already/i],
    ["a definition KaTeX cannot draw", "q", "\\frac{1", /closing brace|invalid/i],
  ])("does not save %s", async (_label, nameText, bodyText, message) => {
    settings.set("notes.latexMacros", N);
    const { user } = await openForm();
    await user.type(name(), nameText);
    await setBody(user, bodyText);
    expect(save()).toBeDisabled();
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(saved()).toBe(N);
  });

  it("does not save without a name or a definition", async () => {
    const { user } = await openForm();
    expect(save()).toBeDisabled();
    await user.type(name(), "q");
    expect(save()).toBeDisabled();
  });

  it("is dropped by Cancel, saving nothing", async () => {
    const { user } = await openForm();
    await user.type(name(), "q");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("textbox", { name: "Command name" })).toBeNull();
    expect(saved()).toBe("");
  });
});

describe("editing and deleting", () => {
  it("edits a macro in place, keeping its place in the list", async () => {
    settings.set("notes.latexMacros", `${N}\n${ABS}`);
    const { user } = renderWithProviders(<LatexMacrosPanel />);
    await user.click(within(rowOf("\\N")).getByRole("button", { name: "Edit \\N" }));
    const body = screen.getByRole("textbox", { name: "Definition" });
    expect(body).toHaveValue("\\mathbb{N}");
    await user.clear(body);
    await user.paste("\\mathbf{N}");
    await user.click(screen.getByRole("button", { name: "Save macro" }));
    expect(saved()).toBe("\\newcommand{\\N}{\\mathbf{N}}\n" + ABS);
  });

  it("renames a macro without calling it a duplicate of itself", async () => {
    settings.set("notes.latexMacros", N);
    const { user } = renderWithProviders(<LatexMacrosPanel />);
    await user.click(within(rowOf("\\N")).getByRole("button", { name: "Edit \\N" }));
    expect(screen.getByRole("button", { name: "Save macro" })).toBeEnabled();
    const name = screen.getByRole("textbox", { name: "Command name" });
    await user.clear(name);
    await user.type(name, "Nat");
    await user.click(screen.getByRole("button", { name: "Save macro" }));
    expect(saved()).toBe("\\newcommand{\\Nat}{\\mathbb{N}}");
  });

  it("asks before deleting, and deletes on confirm", async () => {
    settings.set("notes.latexMacros", `${N}\n${ABS}`);
    const { user } = renderWithProviders(<LatexMacrosPanel />);
    await user.click(within(rowOf("\\N")).getByRole("button", { name: "Delete \\N" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(saved()).toBe(`${N}\n${ABS}`);
    await user.click(within(rowOf("\\N")).getByRole("button", { name: "Delete \\N" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }),
    );
    await waitFor(() => expect(saved()).toBe(ABS));
  });
});

describe("the macros everyone starts with", () => {
  it("are in the list from the start, with no presets menu to add them from", () => {
    settings.set("notes.latexMacros", serializeLatexMacros(DEFAULT_LATEX_MACROS));
    renderWithProviders(<LatexMacrosPanel />);
    for (const name of ["\\abs", "\\norm", "\\inner"]) {
      expect(rowOf(name)).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: /preset/i })).toBeNull();
    expect(screen.queryByText(/preset/i)).toBeNull();
  });

  it("can be edited and deleted like any other", async () => {
    settings.set("notes.latexMacros", serializeLatexMacros(DEFAULT_LATEX_MACROS));
    const { user } = renderWithProviders(<LatexMacrosPanel />);
    await user.click(within(rowOf("\\dd")).getByRole("button", { name: "Delete \\dd" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }),
    );
    await waitFor(() => expect(saved()).not.toContain("\\dd}"));
    expect(saved()).toContain("\\abs");
  });
});

describe("the List and Raw tabs", () => {
  it("are tabs, with List selected to begin with", () => {
    renderWithProviders(<LatexMacrosPanel />);
    expect(screen.getByRole("tablist", { name: "View" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "List" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Raw" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tabpanel")).toBeInTheDocument();
  });

  it("switch the panel, and hide the list's own buttons in the raw view", async () => {
    settings.set("notes.latexMacros", N);
    const { user } = renderWithProviders(<LatexMacrosPanel />);
    await user.click(screen.getByRole("tab", { name: "Raw" }));
    expect(screen.getByRole("tab", { name: "Raw" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("textbox", { name: "LaTeX macros" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add macro" })).toBeNull();
    await user.click(screen.getByRole("tab", { name: "List" }));
    expect(screen.getByRole("button", { name: "Add macro" })).toBeInTheDocument();
  });
});

describe("the raw view", () => {
  it("shows and edits the text, and the list follows it", async () => {
    settings.set("notes.latexMacros", N);
    const { user } = renderWithProviders(<LatexMacrosPanel />);
    await user.click(screen.getByRole("tab", { name: "Raw" }));
    const field = screen.getByRole("textbox", { name: "LaTeX macros" });
    expect(field).toHaveValue(N);
    await user.click(field);
    await user.paste(`\n${ABS}`);
    await user.tab();
    await user.click(screen.getByRole("tab", { name: "List" }));
    expect(rowOf("\\abs")).toBeInTheDocument();
  });
});

describe("a text with lines that do not parse", () => {
  const BAD = "\\newcommand{\\ok}{1}\n\\newcommand{\\bad}{open";

  it("says which line, keeps the list read only, and sends you to the raw view", async () => {
    settings.set("notes.latexMacros", BAD);
    const { user } = renderWithProviders(<LatexMacrosPanel />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Line 2");
    expect(rowOf("\\ok")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add macro" })).toBeDisabled();
    expect(within(rowOf("\\ok")).getByRole("button", { name: "Edit \\ok" })).toBeDisabled();
    await user.click(within(alert).getByRole("button", { name: "Fix in the raw view" }));
    expect(screen.getByRole("textbox", { name: "LaTeX macros" })).toHaveValue(BAD);
  });
});

describe("comments in the text", () => {
  it("warns that editing the list drops them", () => {
    settings.set("notes.latexMacros", `% my notation\n${N}`);
    renderWithProviders(<LatexMacrosPanel />);
    expect(screen.getByText(/comments .* dropped/i)).toBeInTheDocument();
  });

  it("does not warn without any", () => {
    settings.set("notes.latexMacros", N);
    renderWithProviders(<LatexMacrosPanel />);
    expect(screen.queryByText(/comments .* dropped/i)).toBeNull();
  });
});

describe("accessibility", () => {
  it("has no violations in the list, the form and the raw view", async () => {
    settings.set("notes.latexMacros", `${N}\n${ABS}`);
    const { user, container } = renderWithProviders(<LatexMacrosPanel />);
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole("button", { name: "Add macro" }));
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("tab", { name: "Raw" }));
    await expectNoA11yViolations(container);
  });
});
