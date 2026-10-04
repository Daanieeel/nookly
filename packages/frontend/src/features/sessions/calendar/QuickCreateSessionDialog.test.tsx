import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeEntity, makeSession } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { calledCommands, callsOf, mockCommand, mockCommandWith } from "#/test/tauri.ts";
import { setDateTimeSettings } from "#/test/time.ts";
import type { SlotRange } from "./calendar-model.ts";
import { QuickCreateSessionDialog } from "./QuickCreateSessionDialog.tsx";

// Wednesday 11 March, 14:00 to 15:30.
const DRAFT: SlotRange = { date: new Date(2026, 2, 11), startMin: 840, endMin: 930 };
const COURSE = makeEntity({ id: "course-1", type: "course", title: "Algebra", key: "CRS-1" });

function setup() {
  setDateTimeSettings({ timeFormat: "european", dateFormat: "american" });
  mockCommand("list_entities", [COURSE, makeEntity({ id: "n1", type: "note", title: "Notes" })]);
  const onCreated = vi.fn();
  const view = renderWithProviders(
    <QuickCreateSessionDialog
      spaceId="space-1"
      draft={DRAFT}
      onOpenChange={() => {}}
      onCreated={onCreated}
    />,
  );
  return { ...view, onCreated };
}

async function fillIn(user: ReturnType<typeof setup>["user"]) {
  await user.type(screen.getByRole("textbox", { name: /Title/ }), "Lecture");
  await user.click(screen.getByRole("button", { name: /Pick course/ }));
  await user.click(await screen.findByRole("option", { name: /Algebra/ }));
}

describe("QuickCreateSessionDialog", () => {
  it("opens on the picked range", () => {
    setup();
    expect(screen.getByRole("dialog", { name: "New session" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Date" })).toHaveTextContent("Wed, Mar 11");
    expect(screen.getByRole("spinbutton", { name: "Start time Hour" })).toHaveAttribute(
      "aria-valuetext",
      "14",
    );
  });

  it("needs a course", async () => {
    const { user } = setup();
    await user.type(screen.getByRole("textbox", { name: /Title/ }), "Lecture");
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText("Pick a course")).toBeInTheDocument();
    expect(calledCommands().filter((c) => c.startsWith("create"))).toEqual([]);
  });

  it("offers only courses in the picker", async () => {
    const { user } = setup();
    // The title takes focus right after opening; wait for it so the picker keeps it.
    await waitFor(() => expect(screen.getByRole("textbox", { name: /Title/ })).toHaveFocus());
    await user.click(screen.getByRole("button", { name: /Pick course/ }));
    expect(await screen.findByRole("option", { name: /Algebra/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Notes/ })).not.toBeInTheDocument();
    expect(callsOf("list_entities")).toEqual([{ spaceId: "space-1", includeDeleted: false }]);
  });

  it("creates a single session", async () => {
    mockCommand("create_one_off_session", makeSession({}, { id: "s-new" }));
    const { user, onCreated } = setup();
    await fillIn(user);
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(["s-new"]));
    expect(callsOf("create_one_off_session")).toEqual([
      {
        spaceId: "space-1",
        title: "Lecture",
        courseId: "course-1",
        date: "2026-03-11",
        startTime: "14:00",
        endTime: "15:30",
        location: null,
      },
    ]);
  });

  it("creates a weekly series through a template on the right weekday", async () => {
    mockCommand("create_session_template", makeEntity({ id: "tpl-1" }));
    mockCommand("generate_occurrences", [makeSession({}, { id: "o1" })]);
    const { user, onCreated } = setup();
    await fillIn(user);
    await user.click(screen.getByRole("button", { name: "Repeat interval" }));
    await user.click(await screen.findByRole("menuitemradio", { name: "Weekly" }));
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(["o1"]));
    // Weekdays count from Monday as 0, so a Wednesday is 2.
    expect(callsOf("create_session_template")[0]).toMatchObject({
      courseId: "course-1",
      weekday: 2,
      startTime: "14:00",
      endTime: "15:30",
      anchorDate: "2026-03-11",
    });
    expect(callsOf("generate_occurrences")).toEqual([
      { templateId: "tpl-1", untilDate: "2026-06-24" },
    ]);
  });

  it("creates a daily series as single sessions, one per day", async () => {
    let n = 0;
    mockCommandWith("create_one_off_session", () => makeSession({}, { id: `s${++n}` }));
    const { user, onCreated } = setup();
    await fillIn(user);
    await user.click(screen.getByRole("button", { name: "Repeat interval" }));
    await user.click(await screen.findByRole("menuitemradio", { name: "Daily" }));
    await user.click(screen.getByRole("button", { name: "Repeat duration unit" }));
    await user.click(await screen.findByRole("menuitemradio", { name: "days" }));
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const dates = callsOf("create_one_off_session").map((args) =>
      args && "date" in args ? args.date : null,
    );
    expect(dates).toHaveLength(16);
    expect(dates[0]).toBe("2026-03-11");
    expect(dates[15]).toBe("2026-03-26");
    expect(onCreated.mock.calls[0][0]).toHaveLength(16);
  });

  it("blocks an end before the start", async () => {
    const { user } = setup();
    await fillIn(user);
    await user.click(screen.getByRole("spinbutton", { name: "End time Hour" }));
    await user.keyboard("13");
    expect(await screen.findByText("End after it starts")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });
});
