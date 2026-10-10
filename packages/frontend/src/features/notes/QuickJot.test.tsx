import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppToaster } from "#/components/app-toaster.tsx";
import { useNavStore } from "#/lib/store/nav.ts";
import { makeEntity, makeSession, makeSpace } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { QuickJotDialog } from "./QuickJot.tsx";

const running = makeSession(
  { courseTitle: "Physics", date: "2026-03-10", startTime: "09:00", endTime: "10:00" },
  { id: "session-1", spaceId: "space-1" },
);
const jot = makeEntity({ id: "jot-1", spaceId: "space-1", type: "jot", title: "Physics" });

function setup() {
  return renderWithProviders(
    <>
      <QuickJotDialog />
      <AppToaster />
    </>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 2, 10, 9, 30) });
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
  mockCommand("list_spaces", [makeSpace({ id: "space-1", name: "Home" })]);
  mockCommand("touch_entity_opened", null);
  useNavStore.setState({
    view: { kind: "dashboard" },
    quickJotOpen: false,
    activeSpaceId: "space-1",
  });
});

const SESSION_JOT_KEYS = "{Control>}{Shift>}j{/Shift}{/Control}";

describe("the session jot shortcut", () => {
  it("opens the jot of the running session, not the quick jot box", async () => {
    mockCommand("list_sessions_all", [running]);
    mockCommand("get_session_pages", { jot: null, note: null });
    mockCommand("create_session_page", jot);
    const { user } = setup();
    await user.keyboard(SESSION_JOT_KEYS);
    await waitFor(() =>
      expect(useNavStore.getState().view).toMatchObject({ kind: "entity", entityId: "jot-1" }),
    );
    expect(callsOf("create_session_page")[0]).toMatchObject({ sessionId: "session-1" });
    expect(useNavStore.getState().quickJotOpen).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows an error toast and opens nothing when no session is running", async () => {
    mockCommand("list_sessions_all", []);
    const { user } = setup();
    await user.keyboard(SESSION_JOT_KEYS);
    expect(await screen.findByText("No session is running right now")).toBeTruthy();
    expect(useNavStore.getState().quickJotOpen).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(useNavStore.getState().view).toEqual({ kind: "dashboard" });
  });
});

describe("the quick jot box", () => {
  it("opens on its own shortcut, with the session jot shortcut as a tip", async () => {
    const { user } = setup();
    await user.keyboard("{Control>}j{/Control}");
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Session jot");
    // The tip shows the shortcut that does it, as keycaps.
    const tip = screen.getByText("Session jot");
    expect(tip.querySelectorAll("kbd").length).toBeGreaterThanOrEqual(3);
  });

  it("keeps the tip on one line and gives the box room for it", async () => {
    const { user } = setup();
    await user.keyboard("{Control>}j{/Control}");
    const dialog = await screen.findByRole("dialog");
    expect(dialog.className).toContain("w-[min(38rem,");
    expect(screen.getByText("Session jot")).toHaveClass("whitespace-nowrap");
  });

  it("is never bound to a session: the shortcut does not carry one into it", async () => {
    mockCommand("list_sessions_all", [running]);
    mockCommand("get_session_pages", { jot: jot, note: null });
    const { user } = setup();
    await user.keyboard(SESSION_JOT_KEYS);
    await waitFor(() => expect(useNavStore.getState().view.kind).toBe("entity"));
    await user.keyboard("{Control>}j{/Control}");
    const dialog = await screen.findByRole("dialog");
    // A plain capture box: the Space chip, not a session.
    expect(dialog).toHaveTextContent("Home");
    expect(dialog).not.toHaveTextContent("Physics");
  });
});
