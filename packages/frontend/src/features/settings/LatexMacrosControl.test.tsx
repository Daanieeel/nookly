import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { settings } from "#/lib/settings/settings.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { LatexMacrosControl } from "./setting-controls";

beforeEach(() => settings.set("notes.latexMacros", ""));
afterEach(() => settings.set("notes.latexMacros", ""));

describe("the LaTeX macros control", () => {
  it("shows the saved macros", () => {
    settings.set("notes.latexMacros", "\\newcommand{\\N}{\\mathbb{N}}");
    renderWithProviders(<LatexMacrosControl />);
    expect(screen.getByRole("textbox", { name: "LaTeX macros" })).toHaveValue(
      "\\newcommand{\\N}{\\mathbb{N}}",
    );
  });

  it("saves what is typed when the field is left", async () => {
    const { user } = renderWithProviders(<LatexMacrosControl />);
    const field = screen.getByRole("textbox", { name: "LaTeX macros" });
    await user.click(field);
    await user.paste("\\newcommand{\\v}{1}");
    expect(settings.get("notes.latexMacros")).toBe("");
    await user.tab();
    expect(settings.get("notes.latexMacros")).toBe("\\newcommand{\\v}{1}");
  });

  it("says which line is wrong, while typing, and still saves the rest", async () => {
    const { user } = renderWithProviders(<LatexMacrosControl />);
    await user.click(screen.getByRole("textbox", { name: "LaTeX macros" }));
    await user.paste("\\newcommand{\\ok}{1}\n\\newcommand{\\bad}{open");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Line 2");
    expect(alert).toHaveTextContent(/closing brace/i);
    await user.tab();
    expect(settings.get("notes.latexMacros")).toContain("\\ok");
  });

  it("says nothing while every definition parses", async () => {
    const { user } = renderWithProviders(<LatexMacrosControl />);
    await user.click(screen.getByRole("textbox", { name: "LaTeX macros" }));
    await user.paste("\\newcommand{\\ok}{1}");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("follows the setting when it is reset", async () => {
    settings.set("notes.latexMacros", "\\newcommand{\\a}{1}");
    renderWithProviders(<LatexMacrosControl />);
    settings.set("notes.latexMacros", "");
    expect(await screen.findByDisplayValue("")).toBeInTheDocument();
  });
});
