import { act, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { settings } from "#/lib/settings/settings.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { useThemeStore } from "#/lib/theme.ts";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { SettingsDialog } from "./SettingsDialog.tsx";

async function openAppearance() {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  const rendered = renderWithProviders(<SettingsDialog />);
  act(() => useNavStore.getState().setSettingsOpen(true));
  await rendered.user.click(await screen.findByRole("button", { name: "Appearance" }));
  return rendered;
}

beforeEach(() => {
  act(() => {
    useNavStore.getState().setSettingsOpen(false);
    settings.reset("appearance.theme");
    settings.reset("appearance.fileViewerTheme");
    useThemeStore.setState({ theme: "system" });
  });
});

describe("the Appearance page", () => {
  it("offers the theme as one card per choice, with the current one checked", async () => {
    await openAppearance();
    const group = screen.getByRole("radiogroup", { name: "Theme" });
    const cards = within(group).getAllByRole("radio");
    expect(cards.map((c) => c.textContent)).toEqual(["Light", "Dark", "System"]);
    expect(within(group).getByRole("radio", { name: "System" })).toBeChecked();
    expect(within(group).getByRole("radio", { name: "Light" })).not.toBeChecked();
  });

  it("saves and applies the theme of the card that is clicked", async () => {
    const { user } = await openAppearance();
    const group = screen.getByRole("radiogroup", { name: "Theme" });
    await user.click(within(group).getByRole("radio", { name: "Dark" }));
    expect(settings.get("appearance.theme")).toBe("dark");
    expect(within(group).getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(document.documentElement).toHaveClass("dark");
  });

  it("offers the file viewer theme the same way", async () => {
    const { user } = await openAppearance();
    const group = screen.getByRole("radiogroup", { name: "File viewer theme" });
    expect(
      within(group)
        .getAllByRole("radio")
        .map((c) => c.textContent),
    ).toEqual(["Light", "Dark", "Use Defaults"]);
    await user.click(within(group).getByRole("radio", { name: "Light" }));
    expect(settings.get("appearance.fileViewerTheme")).toBe("light");
  });

  it("has no axe violations", async () => {
    await openAppearance();
    await expectNoA11yViolations();
  });
});
