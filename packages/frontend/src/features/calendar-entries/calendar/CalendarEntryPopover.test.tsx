import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CalendarEntry } from "#/lib/api/types.ts";
import { makeCalendarEntry } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { calledCommands, callsOf, mockCommand } from "#/test/tauri.ts";
import { freezeTime, setDateTimeSettings } from "#/test/time.ts";
import { CalendarEntryPopover } from "./CalendarEntryPopover.tsx";

const SERIES = makeCalendarEntry({ templateId: "tpl-1", date: "2026-03-10", location: "Clinic" });

function setup(entry: CalendarEntry = SERIES) {
  setDateTimeSettings({ timeFormat: "european", dateFormat: "american" });
  for (const cmd of [
    "update_entity",
    "override_calendar_entry_occurrence",
    "update_calendar_entry_series",
    "soft_delete_entity",
  ]) {
    mockCommand(cmd, null);
  }
  return renderWithProviders(
    <CalendarEntryPopover spaceId="space-1" entry={entry}>
      <button type="button">Open entry</button>
    </CalendarEntryPopover>,
  );
}

async function openEditor(user: ReturnType<typeof setup>["user"]) {
  await user.click(screen.getByRole("button", { name: "Open entry" }));
  await user.click(await screen.findByRole("button", { name: "Edit entry" }));
}

async function rename(user: ReturnType<typeof setup>["user"], title: string) {
  const input = screen.getByRole("textbox", { name: /Title/ });
  await user.clear(input);
  await user.type(input, title);
}

describe("CalendarEntryPopover summary", () => {
  it("shows the entry's day, time, place and that it repeats", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Open entry" }));
    expect(await screen.findByText("Dentist")).toBeInTheDocument();
    expect(screen.getByText(/Tuesday, Mar 10, 9:00 to 10:00/)).toBeInTheDocument();
    expect(screen.getByText("Clinic")).toBeInTheDocument();
    expect(screen.getByText("Repeats")).toBeInTheDocument();
  });

  it("shows a multi day all day entry's span", async () => {
    const { user } = setup(
      makeCalendarEntry({ endDate: "2026-03-12", allDay: true, startTime: null, endTime: null }),
    );
    await user.click(screen.getByRole("button", { name: "Open entry" }));
    expect(
      await screen.findByText(/Tuesday, Mar 10 to Thursday, Mar 12, all day/),
    ).toBeInTheDocument();
  });

  it("cancels an occurrence", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Open entry" }));
    await user.click(await screen.findByRole("button", { name: "Cancel entry" }));
    await waitFor(() =>
      expect(callsOf("override_calendar_entry_occurrence")).toEqual([
        { entityId: "entry-1", patch: { cancelled: true } },
      ]),
    );
  });

  it("restores a cancelled occurrence", async () => {
    const { user } = setup(makeCalendarEntry({ cancelled: true }));
    await user.click(screen.getByRole("button", { name: "Open entry" }));
    expect(await screen.findByText("Cancelled")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Restore entry" }));
    await waitFor(() =>
      expect(callsOf("override_calendar_entry_occurrence")).toEqual([
        { entityId: "entry-1", patch: { cancelled: false } },
      ]),
    );
  });

  it("moves a one off entry to Trash in one click", async () => {
    const { user } = setup(makeCalendarEntry());
    await user.click(screen.getByRole("button", { name: "Open entry" }));
    await user.click(await screen.findByRole("button", { name: "Delete entry" }));
    await waitFor(() => expect(callsOf("soft_delete_entity")).toEqual([{ id: "entry-1" }]));
  });

  it("asks which occurrences to delete in a series", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Open entry" }));
    await user.click(await screen.findByRole("button", { name: "Delete entry" }));
    expect(await screen.findByRole("menuitem", { name: "Delete this entry" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Delete this and following/ })).toBeInTheDocument();
    expect(calledCommands()).toEqual([]);
  });
});

describe("CalendarEntryPopover editing", () => {
  it("edits only this occurrence by default", async () => {
    const { user } = setup();
    await openEditor(user);
    await rename(user, "Checkup");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(callsOf("override_calendar_entry_occurrence")).toHaveLength(1));
    expect(callsOf("update_entity")).toEqual([{ id: "entry-1", patch: { title: "Checkup" } }]);
    expect(callsOf("override_calendar_entry_occurrence")).toEqual([
      {
        entityId: "entry-1",
        patch: {
          date: "2026-03-10",
          endDate: null,
          startTime: "09:00",
          endTime: "10:00",
          allDay: false,
          location: "Clinic",
        },
      },
    ]);
    expect(callsOf("update_calendar_entry_series")).toEqual([]);
  });

  it("edits this and every later entry from the entry's date, anchored on it", async () => {
    freezeTime("2026-03-20T10:00:00");
    const { user } = setup();
    await openEditor(user);
    await user.click(screen.getByRole("tab", { name: "This and after" }));
    await rename(user, "Checkup");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(callsOf("update_calendar_entry_series")).toHaveLength(1));
    expect(callsOf("update_calendar_entry_series")).toEqual([
      {
        templateId: "tpl-1",
        fromDate: "2026-03-10",
        patch: { title: "Checkup" },
        anchorId: "entry-1",
      },
    ]);
    expect(calledCommands()).toEqual(["update_calendar_entry_series"]);
  });

  it("edits every upcoming entry from today", async () => {
    freezeTime("2026-03-20T10:00:00");
    const { user } = setup();
    await openEditor(user);
    await user.click(screen.getByRole("tab", { name: "Upcoming after today" }));
    expect(
      screen.getByText(/Changes every entry from today on. This one is earlier/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "All day" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(callsOf("update_calendar_entry_series")).toHaveLength(1));
    expect(callsOf("update_calendar_entry_series")).toEqual([
      {
        templateId: "tpl-1",
        fromDate: "2026-03-20",
        patch: { allDay: true },
        anchorId: "entry-1",
      },
    ]);
  });

  it("hides the dates for a series edit", async () => {
    const { user } = setup();
    await openEditor(user);
    expect(screen.getByRole("button", { name: "Date" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Upcoming after today" }));
    expect(screen.queryByRole("button", { name: "Date" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "End date" })).not.toBeInTheDocument();
  });

  it("leaves the times out of an all day series patch when only the title changed", async () => {
    // Intended: an all day entry has no times, so untouched times must not be written.
    const { user } = setup(
      makeCalendarEntry({ templateId: "tpl-1", allDay: true, startTime: null, endTime: null }),
    );
    await openEditor(user);
    await user.click(screen.getByRole("tab", { name: "This and after" }));
    await rename(user, "Holiday");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(callsOf("update_calendar_entry_series")).toHaveLength(1));
    const call = callsOf("update_calendar_entry_series")[0];
    expect(call).toMatchObject({ patch: { title: "Holiday" } });
    expect(call).not.toHaveProperty("patch.startTime");
    expect(call).not.toHaveProperty("patch.endTime");
  });

  it("has no scope for a one off entry", async () => {
    const { user } = setup(makeCalendarEntry());
    await openEditor(user);
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("hides the times for an all day entry", async () => {
    const { user } = setup();
    await openEditor(user);
    expect(screen.getByRole("group", { name: "Start time" })).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "All day" }));
    expect(screen.queryByRole("group", { name: "Start time" })).not.toBeInTheDocument();
  });

  it("blocks saving an end before the start", async () => {
    const { user } = setup();
    await openEditor(user);
    await user.click(screen.getByRole("spinbutton", { name: "End time Hour" }));
    await user.keyboard("07");
    expect(await screen.findByText("End after it starts")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("goes back to the summary on Cancel", async () => {
    const { user } = setup();
    await openEditor(user);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByRole("button", { name: "Edit entry" })).toBeInTheDocument();
    expect(calledCommands()).toEqual([]);
  });
});
