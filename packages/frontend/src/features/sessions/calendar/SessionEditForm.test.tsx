import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SessionOccurrence } from "#/lib/api/types.ts";
import { makeSession } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { calledCommands, callsOf, mockCommand, mockCommandWith } from "#/test/tauri.ts";
import { freezeTime, setDateTimeSettings } from "#/test/time.ts";
import { SessionEditForm } from "./SessionPopover.tsx";

const SERIES = makeSession({ templateId: "tpl-1", date: "2026-03-10", location: "Room 1" });

function setup(occurrence: SessionOccurrence = SERIES) {
  setDateTimeSettings({ timeFormat: "european", dateFormat: "european" });
  mockCommand("update_entity", null);
  mockCommand("override_occurrence", null);
  mockCommand("update_session_series", null);
  const onDone = vi.fn();
  const view = renderWithProviders(<SessionEditForm occurrence={occurrence} onDone={onDone} />);
  return { ...view, onDone };
}

async function rename(user: ReturnType<typeof setup>["user"], title: string) {
  const input = screen.getByRole("textbox", { name: /Title/ });
  await user.clear(input);
  await user.type(input, title);
}

describe("SessionEditForm", () => {
  it("edits only this occurrence by default", async () => {
    const { user, onDone } = setup();
    await rename(user, "Lab");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(calledCommands()).toEqual(["update_entity", "override_occurrence"]);
    expect(callsOf("update_entity")).toEqual([{ id: "session-1", patch: { title: "Lab" } }]);
    expect(callsOf("override_occurrence")).toEqual([
      {
        entityId: "session-1",
        patch: { date: "2026-03-10", startTime: "09:00", endTime: "10:00", location: "Room 1" },
      },
    ]);
  });

  it("leaves the title alone when it didn't change", async () => {
    const { user, onDone } = setup();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(calledCommands()).toEqual(["override_occurrence"]);
  });

  it("clears a blank location", async () => {
    const { user, onDone } = setup();
    await user.clear(screen.getByRole("textbox", { name: "Location" }));
    await user.type(screen.getByRole("textbox", { name: "Location" }), "   ");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(callsOf("override_occurrence")[0]).toMatchObject({ patch: { location: null } });
  });

  it("edits this and every later occurrence from the occurrence's own date", async () => {
    freezeTime("2026-03-20T10:00:00");
    const { user, onDone } = setup();
    await user.click(screen.getByRole("tab", { name: "This and after" }));
    expect(screen.getByText(/Changes this session and every later one/)).toBeInTheDocument();
    await rename(user, "Lab");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(calledCommands()).toEqual(["update_session_series"]);
    expect(callsOf("update_session_series")).toEqual([
      {
        templateId: "tpl-1",
        fromDate: "2026-03-10",
        patch: { title: "Lab" },
        anchorId: "session-1",
      },
    ]);
  });

  it("edits every upcoming occurrence from today", async () => {
    freezeTime("2026-03-20T10:00:00");
    const { user, onDone } = setup();
    await user.click(screen.getByRole("tab", { name: "Upcoming after today" }));
    expect(
      screen.getByText(/Changes every session from today on. This one is earlier/),
    ).toBeInTheDocument();
    await user.clear(screen.getByRole("textbox", { name: "Location" }));
    await user.type(screen.getByRole("textbox", { name: "Location" }), "Hall B");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(callsOf("update_session_series")).toEqual([
      {
        templateId: "tpl-1",
        fromDate: "2026-03-20",
        patch: { location: "Hall B" },
        anchorId: "session-1",
      },
    ]);
  });

  it("says an upcoming edit includes this occurrence when it is today or later", async () => {
    freezeTime("2026-03-10T08:00:00");
    const { user } = setup();
    await user.click(screen.getByRole("tab", { name: "Upcoming after today" }));
    expect(
      screen.getByText(/Changes this session and every one from today on/),
    ).toBeInTheDocument();
  });

  it("hides the date for a series edit", async () => {
    const { user } = setup();
    expect(screen.getByRole("button", { name: "Date" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "This and after" }));
    expect(screen.queryByRole("button", { name: "Date" })).not.toBeInTheDocument();
  });

  it("sends an empty patch when nothing changed in a series edit", async () => {
    const { user, onDone } = setup();
    await user.click(screen.getByRole("tab", { name: "This and after" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(callsOf("update_session_series")[0]).toMatchObject({ patch: {} });
  });

  it("has no scope for a one off session", () => {
    setup(makeSession({ templateId: null }));
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("blocks saving an end before the start", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("spinbutton", { name: "End time Hour" }));
    await user.keyboard("08");
    expect(screen.getByRole("spinbutton", { name: "End time Hour" })).toHaveAttribute(
      "aria-valuetext",
      "08",
    );
    expect(await screen.findByText("End after it starts")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(calledCommands()).toEqual([]);
  });

  it("blocks saving without a title", async () => {
    const { user } = setup();
    await user.clear(screen.getByRole("textbox", { name: /Title/ }));
    expect(await screen.findByText("Give the session a title")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("stays open with the error when saving fails", async () => {
    const { user, onDone } = setup();
    mockCommandWith("override_occurrence", () => {
      throw new Error("Session is in Trash");
    });
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Session is in Trash/);
    expect(onDone).not.toHaveBeenCalled();
  });
});
