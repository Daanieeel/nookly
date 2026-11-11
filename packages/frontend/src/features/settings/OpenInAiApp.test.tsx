import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { preferences } from "#/lib/preferences.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, mockCommand, mockCommandWith } from "#/test/tauri.ts";
import { OpenInAiApp } from "./OpenInAiApp.tsx";
import { orderAiApps } from "./ai-apps.tsx";

const FOUND = [
  { id: "claude", name: "Claude" },
  { id: "cursor", name: "Cursor" },
  { id: "vscode", name: "VS Code" },
];

beforeEach(() => {
  mockCommand("list_ai_apps", FOUND);
  mockCommand("open_agent_dir_in", null);
});

async function openPopover() {
  const view = renderWithProviders(<OpenInAiApp />);
  const button = await screen.findByRole("button", { name: "Open in" });
  await waitFor(() => expect(button).toBeEnabled());
  await view.user.click(button);
  return { ...view, popover: await screen.findByRole("dialog", { name: "Open in" }) };
}

const names = (popover: HTMLElement) =>
  within(popover)
    .getAllByRole("button")
    .map((b) => b.textContent);

describe("orderAiApps", () => {
  it("puts the last used app first and keeps the rest in order", () => {
    expect(orderAiApps(FOUND, "vscode").map((a) => a.id)).toEqual(["vscode", "claude", "cursor"]);
  });

  it("keeps the order when the last used app is not there anymore", () => {
    expect(orderAiApps(FOUND, "zed").map((a) => a.id)).toEqual(["claude", "cursor", "vscode"]);
    expect(orderAiApps(FOUND, null).map((a) => a.id)).toEqual(["claude", "cursor", "vscode"]);
  });

  it("leaves out an app the frontend has no logo for", () => {
    expect(orderAiApps([...FOUND, { id: "future", name: "Future" }], null)).toHaveLength(3);
  });
});

describe("OpenInAiApp", () => {
  it("lists the installed apps, each with its logo", async () => {
    const { popover } = await openPopover();
    expect(names(popover)).toEqual(["Claude", "Cursor", "VS Code"]);
    for (const button of within(popover).getAllByRole("button")) {
      expect(button.querySelector("svg")).not.toBeNull();
    }
  });

  it("shows the last used app first", async () => {
    preferences.set(STORAGE_KEYS.agentOpenIn, "cursor");
    const { popover } = await openPopover();
    expect(names(popover)).toEqual(["Cursor", "Claude", "VS Code"]);
  });

  it("opens the agent folder in the picked app, closes and remembers it", async () => {
    const { user, popover } = await openPopover();
    await user.click(within(popover).getByRole("button", { name: "VS Code" }));
    await waitFor(() => expect(callsOf("open_agent_dir_in")).toHaveLength(1));
    expect(callsOf("open_agent_dir_in")[0]).toMatchObject({ appId: "vscode" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Open in" })).toBeNull());
    expect(preferences.get(STORAGE_KEYS.agentOpenIn)).toBe("vscode");
  });

  it("keeps the list open and says what failed when the app does not start", async () => {
    mockCommandWith("open_agent_dir_in", () => {
      throw new Error("file error: Couldn't start Cursor");
    });
    const { user, popover } = await openPopover();
    await user.click(within(popover).getByRole("button", { name: "Cursor" }));
    expect(await within(popover).findByText("Couldn't open Cursor, try again")).toBeInTheDocument();
    expect(preferences.get(STORAGE_KEYS.agentOpenIn)).toBeNull();
  });

  it("is off, with a tooltip saying why, when no app is found", async () => {
    mockCommand("list_ai_apps", []);
    const { user } = renderWithProviders(<OpenInAiApp />);
    const button = await screen.findByRole("button", { name: "Open in" });
    await waitFor(() => expect(button).toBeDisabled());
    await user.hover(button.parentElement ?? button);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("No supported AI app found");
  });

  it("is off when looking for apps fails", async () => {
    mockCommandWith("list_ai_apps", () => {
      throw new Error("nope");
    });
    renderWithProviders(<OpenInAiApp />);
    const button = await screen.findByRole("button", { name: "Open in" });
    await waitFor(() => expect(button).toBeDisabled());
  });

  it("has no accessibility violations", async () => {
    await openPopover();
    await expectNoA11yViolations();
  });
});
