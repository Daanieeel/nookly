import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SlotRange } from "#/features/sessions/calendar/calendar-model.ts";
import { makeCalendarEntry, makeEntity, makeSpace } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { calledCommands, callsOf, mockCommand } from "#/test/tauri.ts";
import { setDateTimeSettings } from "#/test/time.ts";
import { QuickCreateCalendarEntryDialog } from "./QuickCreateCalendarEntryDialog.tsx";

// Tuesday 10 March, 09:00 to 10:30.
const DRAFT: SlotRange = { date: new Date(2026, 2, 10), startMin: 540, endMin: 630 };

function setup(draft: SlotRange = DRAFT, crossSpace = false) {
  setDateTimeSettings({ timeFormat: "european", dateFormat: "american" });
  const onCreated = vi.fn();
  const onOpenChange = vi.fn();
  const view = renderWithProviders(
    <QuickCreateCalendarEntryDialog
      spaceId={crossSpace ? undefined : "space-1"}
      draft={draft}
      onOpenChange={onOpenChange}
      onCreated={onCreated}
    />,
  );
  return { ...view, onCreated, onOpenChange };
}

describe("QuickCreateCalendarEntryDialog", () => {
  it("opens on the picked range", async () => {
    setup();
    expect(screen.getByRole("dialog", { name: "New calendar entry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Date" })).toHaveTextContent("Tue, Mar 10");
    expect(screen.getByRole("spinbutton", { name: "Start time Hour" })).toHaveAttribute(
      "aria-valuetext",
      "09",
    );
    expect(screen.getByRole("spinbutton", { name: "End time Minute" })).toHaveAttribute(
      "aria-valuetext",
      "30",
    );
    await waitFor(() => expect(screen.getByRole("textbox", { name: /Title/ })).toHaveFocus());
  });

  it("creates a one off entry", async () => {
    mockCommand("create_one_off_calendar_entry", makeCalendarEntry({}, { id: "new-1" }));
    const { user, onCreated, onOpenChange } = setup();
    await user.type(screen.getByRole("textbox", { name: /Title/ }), "  Dentist ");
    await user.type(screen.getByRole("textbox", { name: "Location" }), "Clinic");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(["new-1"]));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(callsOf("create_one_off_calendar_entry")).toEqual([
      {
        spaceId: "space-1",
        title: "Dentist",
        date: "2026-03-10",
        endDate: null,
        startTime: "09:00",
        endTime: "10:30",
        allDay: false,
        location: "Clinic",
        description: null,
      },
    ]);
  });

  it("creates an all day entry without times", async () => {
    mockCommand("create_one_off_calendar_entry", makeCalendarEntry({}, { id: "new-1" }));
    const { user, onCreated } = setup();
    await user.type(screen.getByRole("textbox", { name: /Title/ }), "Holiday");
    await user.click(screen.getByRole("checkbox", { name: "All day" }));
    expect(screen.queryByRole("group", { name: "Start time" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(callsOf("create_one_off_calendar_entry")[0]).toMatchObject({
      allDay: true,
      startTime: null,
      endTime: null,
    });
  });

  it("creates a weekly series through a template, generated up to the last date", async () => {
    mockCommand("create_calendar_entry_template", makeEntity({ id: "tpl-1" }));
    mockCommand("generate_calendar_entry_occurrences", [
      makeCalendarEntry({}, { id: "o1" }),
      makeCalendarEntry({}, { id: "o2" }),
    ]);
    const { user, onCreated } = setup();
    await user.type(screen.getByRole("textbox", { name: /Title/ }), "Yoga");
    await user.click(screen.getByRole("button", { name: "Repeat interval" }));
    await user.click(await screen.findByRole("menuitemradio", { name: "Weekly" }));
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(["o1", "o2"]));
    expect(callsOf("create_calendar_entry_template")).toEqual([
      {
        spaceId: "space-1",
        title: "Yoga",
        recurrence: "weekly",
        startTime: "09:00",
        endTime: "10:30",
        allDay: false,
        location: null,
        description: null,
        anchorDate: "2026-03-10",
      },
    ]);
    // 16 weeks from 10 March: the last one is 15 weeks later.
    expect(callsOf("generate_calendar_entry_occurrences")).toEqual([
      { templateId: "tpl-1", untilDate: "2026-06-23" },
    ]);
  });

  it("hides the repeat for a multi day entry and creates it once", async () => {
    mockCommand("create_one_off_calendar_entry", makeCalendarEntry({}, { id: "trip" }));
    const { user, onCreated } = setup({ ...DRAFT, endDate: new Date(2026, 2, 12) });
    expect(screen.getByRole("button", { name: "End date" })).toHaveTextContent("Thu, Mar 12");
    expect(screen.queryByRole("button", { name: "Repeat interval" })).not.toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: /Title/ }), "Trip");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(["trip"]));
    expect(callsOf("create_one_off_calendar_entry")[0]).toMatchObject({
      date: "2026-03-10",
      endDate: "2026-03-12",
    });
    expect(callsOf("create_calendar_entry_template")).toEqual([]);
  });

  it("shows the repeat again once the end date is cleared", async () => {
    const { user } = setup({ ...DRAFT, endDate: new Date(2026, 2, 12) });
    const [, clearEnd] = screen.getAllByRole("button", { name: "Clear Date" });
    await user.click(clearEnd);
    expect(screen.getByRole("button", { name: "Repeat interval" })).toBeInTheDocument();
  });

  it("does not let the required start date be cleared", () => {
    // Intended: only optional dates are clearable, so the required Starts date has no Clear button.
    setup();
    expect(screen.queryByRole("button", { name: "Clear Date" })).not.toBeInTheDocument();
  });

  it("blocks an end time before the start", async () => {
    const { user } = setup();
    await user.type(screen.getByRole("textbox", { name: /Title/ }), "Dentist");
    await user.click(screen.getByRole("spinbutton", { name: "End time Hour" }));
    await user.keyboard("08");
    expect(await screen.findByText("End after it starts")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
    expect(calledCommands()).toEqual([]);
  });

  it("blocks creating without a title", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText("Give the entry a title")).toBeInTheDocument();
    expect(calledCommands()).toEqual([]);
  });

  it("refuses a series with too many entries", async () => {
    const { user } = setup();
    await user.type(screen.getByRole("textbox", { name: /Title/ }), "Pills");
    await user.click(screen.getByRole("button", { name: "Repeat interval" }));
    await user.click(await screen.findByRole("menuitemradio", { name: "Daily" }));
    await user.click(screen.getByRole("button", { name: "Repeat duration unit" }));
    await user.click(await screen.findByRole("menuitemradio", { name: "years" }));
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText("Too many entries, 366 at most")).toBeInTheDocument();
    expect(calledCommands()).toEqual([]);
  });

  it("asks for a Space on the cross Space calendar", async () => {
    mockCommand("list_spaces", [makeSpace({ id: "s1", name: "Uni" })]);
    mockCommand("create_one_off_calendar_entry", makeCalendarEntry({}, { id: "new-1" }));
    const { user, onCreated } = setup(DRAFT, true);
    await user.type(screen.getByRole("textbox", { name: /Title/ }), "Exam");
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText("Pick a Space")).toBeInTheDocument();
    expect(callsOf("create_one_off_calendar_entry")).toEqual([]);
    await user.click(screen.getByRole("combobox", { name: "Space" }));
    await user.click(await screen.findByRole("option", { name: "Uni" }));
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(callsOf("create_one_off_calendar_entry")[0]).toMatchObject({ spaceId: "s1" });
  });
});
