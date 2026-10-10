import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { preferences } from "#/lib/preferences.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { mockCommand } from "#/test/tauri.ts";
import { UpdatedCard } from "./updated-card.tsx";

function setup({ running = "0.31.10", seen = "0.30.2", newer = false } = {}) {
  mockCommand("plugin:app|version", running);
  mockCommand(
    "plugin:updater|check",
    newer
      ? { rid: 1, currentVersion: running, version: "9.9.9", date: null, body: null, rawJson: {} }
      : null,
  );
  if (seen) preferences.set(STORAGE_KEYS.lastSeenVersion, seen);
  return renderWithProviders(<UpdatedCard />);
}

beforeEach(() => {
  preferences.remove(STORAGE_KEYS.lastSeenVersion);
  useNavStore.setState({ whatsNewOpen: false });
});

describe("UpdatedCard", () => {
  it("tells the user the update worked and offers to show what is new", async () => {
    setup();
    expect(await screen.findByText("Nookly updated")).toBeTruthy();
    expect(screen.getByText("You are on version 0.31.10.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "See what's new" })).toBeTruthy();
  });

  it("is a success card, in the success color", async () => {
    setup();
    const title = await screen.findByText("Nookly updated");
    expect(title).toHaveClass("text-positive");
  });

  it("opens the what's new dialog and is gone afterwards", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "See what's new" }));
    expect(useNavStore.getState().whatsNewOpen).toBe(true);
    await waitFor(() => expect(screen.queryByText("Nookly updated")).toBeNull());
    expect(preferences.get(STORAGE_KEYS.lastSeenVersion)).toBe("0.31.10");
  });

  it("can be dismissed without opening anything", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Dismiss update notice" }));
    expect(screen.queryByText("Nookly updated")).toBeNull();
    expect(useNavStore.getState().whatsNewOpen).toBe(false);
    expect(preferences.get(STORAGE_KEYS.lastSeenVersion)).toBe("0.31.10");
  });

  it("shows the card when no version was ever seen", async () => {
    setup({ seen: "" });
    expect(await screen.findByText("Nookly updated")).toBeTruthy();
  });

  it("shows nothing when the version has not changed", async () => {
    setup({ seen: "0.31.10" });
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(screen.queryByText("Nookly updated")).toBeNull();
  });

  it("gives way to the update card when an even newer version is out", async () => {
    setup({ newer: true });
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(screen.queryByText("Nookly updated")).toBeNull();
  });

  it("has no accessibility violations", async () => {
    setup();
    await screen.findByText("Nookly updated");
    await expectNoA11yViolations();
  });
});
