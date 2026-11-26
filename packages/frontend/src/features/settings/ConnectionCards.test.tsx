import { act, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { ExternalCalendarStatus } from "#/lib/api/externalCalendars.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { mockCommand } from "#/test/tauri.ts";
import { SettingsDialog } from "./SettingsDialog.tsx";

const CONNECTED: ExternalCalendarStatus = {
  googleAvailable: true,
  connections: [
    {
      provider: "google",
      account: "me@example.com",
      calendars: [
        { id: "a", name: "Work", color: null, selected: true },
        { id: "b", name: "Home", color: null, selected: false },
      ],
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
    },
  ],
};

async function openConnections(status: ExternalCalendarStatus) {
  mockCommand("external_calendar_status", status);
  const rendered = renderWithProviders(<SettingsDialog />);
  act(() => useNavStore.getState().setSettingsOpen(true));
  await rendered.user.click(await screen.findByRole("button", { name: "Connections" }));
  return rendered;
}

beforeEach(() => {
  act(() => useNavStore.getState().setSettingsOpen(false));
});

describe("the Connections page", () => {
  it("has a card for each calendar provider, not connected until it is", async () => {
    await openConnections({ googleAvailable: true, connections: [] });
    const list = screen.getByRole("list", { name: "External calendar connections" });
    const cards = within(list).getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(within(card).getByText("Not connected")).toBeInTheDocument();
      expect(within(card).getByRole("button", { name: "Connect" })).toBeInTheDocument();
    }
  });

  it("shows the account and how many calendars a connection shows", async () => {
    await openConnections(CONNECTED);
    const list = screen.getByRole("list", { name: "External calendar connections" });
    expect(await within(list).findByText("me@example.com")).toBeInTheDocument();
    expect(within(list).getByText(/1 calendar shown\. Updated/)).toBeInTheDocument();
    expect(within(list).getByRole("button", { name: "Manage" })).toBeInTheDocument();
    expect(within(list).getAllByRole("button", { name: "Connect" })).toHaveLength(1);
  });

  it("flags a connection that needs attention", async () => {
    const [google] = CONNECTED.connections;
    await openConnections({
      ...CONNECTED,
      connections: [{ ...google, lastError: "Sign in again" }],
    });
    expect(await screen.findByText("Needs attention")).toBeInTheDocument();
  });

  it("opens the connections dialog from a card", async () => {
    const { user } = await openConnections(CONNECTED);
    await user.click(await screen.findByRole("button", { name: "Manage" }));
    expect(await screen.findByRole("dialog", { name: "Calendar connections" })).toBeInTheDocument();
    await expectNoA11yViolations();
  });
});
