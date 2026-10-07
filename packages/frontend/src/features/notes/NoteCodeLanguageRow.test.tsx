import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CodeLanguageSettings } from "#/components/code-language-settings.tsx";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { newCodeBlockLanguage } from "./default-code-language";
import { NoteCodeLanguageRow } from "./NoteCodeLanguageRow";

describe("a note's code language", () => {
  it("shows the default until one is chosen, then saves the choice", async () => {
    mockCommand("get_note_code_language", null);
    mockCommand("set_note_code_language", null);
    renderWithProviders(<NoteCodeLanguageRow entityId="n1" />);
    const trigger = await screen.findByRole("button", {
      name: "Code language for new code blocks",
    });
    expect(trigger).toHaveTextContent("Use default");

    await userEvent.click(trigger);
    await expectNoA11yViolations();
    await userEvent.click(await screen.findByText("Rust"));
    await waitFor(() =>
      expect(callsOf("set_note_code_language")).toEqual([{ entityId: "n1", language: "rust" }]),
    );
  });

  it("shows the saved language and can go back to the default", async () => {
    mockCommand("get_note_code_language", "python");
    mockCommand("set_note_code_language", null);
    renderWithProviders(<NoteCodeLanguageRow entityId="n1" />);
    const trigger = await screen.findByRole("button", {
      name: "Code language for new code blocks",
    });
    await waitFor(() => expect(trigger).toHaveTextContent("Python"));
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByText("Use default"));
    await waitFor(() =>
      expect(callsOf("set_note_code_language")).toEqual([{ entityId: "n1", language: null }]),
    );
  });
});

describe("the default code language setting", () => {
  it("is plain text at first and changes what new code blocks start with", async () => {
    renderWithProviders(<CodeLanguageSettings />);
    const trigger = screen.getByRole("button", { name: "Default code language" });
    expect(trigger).toHaveTextContent("Plain Text");
    expect(newCodeBlockLanguage(null)).toBeNull();

    await userEvent.click(trigger);
    await expectNoA11yViolations();
    await userEvent.click(await screen.findByText("Go"));
    expect(newCodeBlockLanguage(null)).toBe("go");
    expect(newCodeBlockLanguage("python")).toBe("python");
  });
});
