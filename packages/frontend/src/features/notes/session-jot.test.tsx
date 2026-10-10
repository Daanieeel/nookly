import { QueryClient } from "@tanstack/react-query";
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppToaster } from "#/components/app-toaster.tsx";
import { useNavStore } from "#/lib/store/nav.ts";
import { makeEntity, makeSession } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, mockCommand, mockCommandWith } from "#/test/tauri.ts";
import { openCurrentSessionJot } from "./session-jot.ts";

const NOW = new Date(2026, 2, 10, 9, 30);

const running = makeSession(
  { courseTitle: "Physics", date: "2026-03-10", startTime: "09:00", endTime: "10:00" },
  { id: "session-1", spaceId: "space-1" },
);
const later = makeSession(
  { courseTitle: "Chemistry", date: "2026-03-10", startTime: "13:00", endTime: "14:00" },
  { id: "session-2" },
);

const jot = makeEntity({ id: "jot-1", spaceId: "space-1", type: "jot", title: "Physics" });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  window.matchMedia = (media) => ({
    matches: false,
    media,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  });
  mockCommand("touch_entity_opened", null);
  useNavStore.setState({ view: { kind: "dashboard" }, quickJotOpen: false });
});

function run() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = renderWithProviders(<AppToaster />);
  return { ...view, done: openCurrentSessionJot(client) };
}

describe("openCurrentSessionJot", () => {
  it("opens the jot of the session that is running, creating it when it has none", async () => {
    mockCommand("list_sessions_all", [later, running]);
    mockCommand("get_session_pages", { jot: null, note: null });
    mockCommand("create_session_page", jot);
    await run().done;
    expect(callsOf("create_session_page")[0]).toMatchObject({
      sessionId: "session-1",
      kind: "jot",
    });
    expect(useNavStore.getState().view).toMatchObject({ kind: "entity", entityId: "jot-1" });
    // It is the page itself that opens, not the quick jot box.
    expect(useNavStore.getState().quickJotOpen).toBe(false);
  });

  it("opens the jot it already has without making another", async () => {
    mockCommand("list_sessions_all", [running]);
    mockCommand("get_session_pages", { jot, note: null });
    await run().done;
    expect(callsOf("create_session_page")).toHaveLength(0);
    expect(useNavStore.getState().view).toMatchObject({ kind: "entity", entityId: "jot-1" });
  });

  it("shows an error, and opens nothing, when no session is running", async () => {
    mockCommand("list_sessions_all", [later]);
    mockCommand("get_session_pages", { jot: null, note: null });
    run();
    await screen.findByText("No session is running right now");
    expect(callsOf("create_session_page")).toHaveLength(0);
    expect(useNavStore.getState().view).toEqual({ kind: "dashboard" });
    expect(useNavStore.getState().quickJotOpen).toBe(false);
  });

  it("ignores a cancelled session", async () => {
    mockCommand("list_sessions_all", [{ ...running, cancelled: true }]);
    run();
    await screen.findByText("No session is running right now");
    expect(callsOf("create_session_page")).toHaveLength(0);
  });

  it("says what to do next when nothing is running", async () => {
    mockCommand("list_sessions_all", []);
    run();
    expect(await screen.findByText(/while a session is running/)).toBeTruthy();
  });

  it("shows an error when the jot cannot be made, and opens nothing", async () => {
    mockCommand("list_sessions_all", [running]);
    mockCommand("get_session_pages", { jot: null, note: null });
    mockCommandWith("create_session_page", () => {
      throw new Error("disk full");
    });
    run();
    await screen.findByText("Couldn't open the session jot");
    expect(useNavStore.getState().view).toEqual({ kind: "dashboard" });
  });

  it("shows an error when the sessions cannot be read", async () => {
    mockCommandWith("list_sessions_all", () => {
      throw new Error("db locked");
    });
    run();
    await screen.findByText("Couldn't open the session jot");
  });
});
