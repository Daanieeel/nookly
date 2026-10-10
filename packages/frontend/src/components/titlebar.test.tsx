import { screen } from "@testing-library/react";
import { mockWindows } from "@tauri-apps/api/mocks";
import { beforeEach, describe, expect, it } from "vitest";
import { useNavStore } from "#/lib/store/nav.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { mockCommand } from "#/test/tauri.ts";
import { Titlebar } from "./titlebar.tsx";

// jsdom does no layout, so these pin the classes that keep the titlebar inside the window:
// the breadcrumbs give way (and truncate) while the buttons on the right never shrink or
// push past the edge.
describe("Titlebar overflow", () => {
  beforeEach(() => {
    mockWindows("main");
    mockCommand("plugin:window|is_fullscreen", false);
    useNavStore.getState().setView({ kind: "assignments" });
  });

  it("lets the breadcrumbs shrink instead of pushing the buttons out", async () => {
    renderWithProviders(<Titlebar />);
    const crumb = (await screen.findByText("Assignments")).closest("span.flex");
    if (!(crumb instanceof HTMLElement)) throw new Error("the crumb is missing");
    const group = crumb.parentElement;
    if (!(group instanceof HTMLElement)) throw new Error("the breadcrumb group is missing");
    expect(group.className).toContain("min-w-0");
    expect(group.className).not.toContain("shrink-0");
    expect(crumb.className).not.toMatch(/(^|\s)shrink-0/);
  });

  it("keeps the buttons on the right at full size", async () => {
    renderWithProviders(<Titlebar />);
    const settings = await screen.findByRole("button", { name: "Settings" });
    expect(settings.parentElement?.className ?? "").toContain("shrink-0");
    expect(screen.getByRole("button", { name: /Commands/ }).parentElement?.className).toContain(
      "shrink-0",
    );
  });
});
