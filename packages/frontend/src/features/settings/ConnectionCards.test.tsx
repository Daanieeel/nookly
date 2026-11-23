import { act, screen, within } from "@testing-library/react";
import { ApiClient } from "@nookly/shared/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExternalCalendarStatus } from "#/lib/api/externalCalendars.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { mockCommand } from "#/test/tauri.ts";
import { syncRuntime } from "#/features/sync/sync-instance.ts";
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

describe("how you sign in, on the Connections page", () => {
  const ADA = {
    id: "00000000-0000-4000-8000-000000000001",
    username: "ada",
    email: "ada@example.com",
    emailVerified: true,
    createdAt: "",
    termsVersion: null,
  };

  function signedInWith(extra: { hasPassword: boolean; providers: string[] }) {
    mockCommand("sync_query", []);
    const api = new ApiClient({
      baseUrl: "https://sync.example.com",
      tokens: { load: async () => null, save: async () => {} },
    });
    vi.spyOn(api, "me").mockResolvedValue({ ...ADA, ...extra });
    vi.spyOn(syncRuntime, "account").mockReturnValue(api);
    act(() =>
      syncRuntime.store.setState({
        user: { ...ADA, ...extra },
        serverUrl: "https://sync.example.com",
      }),
    );
  }

  afterEach(() => {
    vi.restoreAllMocks();
    act(() => syncRuntime.store.setState({ user: null, serverUrl: null }));
  });

  it("lists the provider an account was made with", async () => {
    signedInWith({ hasPassword: false, providers: ["notion"] });
    await openConnections({ googleAvailable: true, connections: [] });
    const list = await screen.findByRole("list", { name: "Sign in connections" });
    const cards = within(list).getAllByRole("listitem");
    expect(cards).toHaveLength(1);
    expect(within(cards[0]!).getByText("Notion")).toBeInTheDocument();
    expect(within(cards[0]!).getByText("Signs you in to Nookly")).toBeInTheDocument();
    expect(within(cards[0]!).getByText("ada@example.com")).toBeInTheDocument();
    await expectNoA11yViolations();
  });

  it("lists every way the account signs in, the password included", async () => {
    signedInWith({ hasPassword: true, providers: ["google", "github"] });
    await openConnections({ googleAvailable: true, connections: [] });
    const list = await screen.findByRole("list", { name: "Sign in connections" });
    const cards = within(list).getAllByRole("listitem");
    expect(cards.map((card) => card.textContent)).toEqual([
      expect.stringContaining("Google"),
      expect.stringContaining("GitHub"),
      expect.stringContaining("Email and password"),
    ]);
  });

  it("says so when nobody is signed in", async () => {
    await openConnections({ googleAvailable: true, connections: [] });
    expect(
      await screen.findByText("Sign in to Nookly to see how you sign in."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Sign in connections" })).toBeNull();
  });
});
