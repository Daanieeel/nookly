import { act, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { SETTINGS, definitionOf } from "#/lib/settings/registry.ts";
import { settings } from "#/lib/settings/settings.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { SettingsDialog } from "./SettingsDialog.tsx";

async function openEditor() {
  const rendered = renderWithProviders(<SettingsDialog />);
  act(() => useNavStore.getState().setSettingsOpen(true));
  await rendered.user.click(await screen.findByRole("button", { name: "Editor" }));
  return rendered;
}

beforeEach(() => {
  act(() => {
    useNavStore.getState().setSettingsOpen(false);
    settings.reset("notes.editorFont");
    settings.reset("notes.editorFontSize");
  });
});

describe("the page text settings", () => {
  it("are registered with a default that keeps pages as they were, and search words", () => {
    expect(definitionOf("notes.editorFont").default).toBe("default");
    expect(definitionOf("notes.editorFontSize").default).toBe(14);
    expect(definitionOf("notes.editorFontSize").parse(99)).toBe(14);
    expect(definitionOf("notes.editorFont").parse("comic")).toBe("default");
    expect(SETTINGS["notes.editorFont"].synonyms).toContain("typeface");
  });
});

describe("the Editor page text settings", () => {
  it("offers the font as a choice and saves it", async () => {
    const { user } = await openEditor();
    await user.click(screen.getByRole("button", { name: "Page font" }));
    await user.click(await screen.findByRole("option", { name: "Serif" }));
    expect(settings.get("notes.editorFont")).toBe("serif");
  });

  it("changes the size and saves it in range", async () => {
    const { user } = await openEditor();
    const size = screen.getByRole("spinbutton", { name: "Page text size" });
    await user.clear(size);
    await user.type(size, "18");
    await user.tab();
    expect(settings.get("notes.editorFontSize")).toBe(18);
  });

  it("shows a live sample in the chosen font and size", async () => {
    const { user } = await openEditor();
    const sample = () => screen.getByTestId("page-text-sample");
    expect(sample().style.getPropertyValue("--page-scale")).toBe("1");
    await user.click(screen.getByRole("button", { name: "Page font" }));
    await user.click(await screen.findByRole("option", { name: "Mono" }));
    act(() => settings.set("notes.editorFontSize", 21));
    expect(sample().style.getPropertyValue("--page-scale")).toBe("1.5");
    expect(sample().style.getPropertyValue("--page-font")).toContain("monospace");
  });

  it("has no axe violations", async () => {
    await openEditor();
    await expectNoA11yViolations();
  });
});
