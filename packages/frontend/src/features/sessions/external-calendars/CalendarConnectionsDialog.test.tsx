import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, mockCommand, mockCommandWith } from "#/test/tauri.ts";
import type { CalendarConnection } from "#/lib/api/externalCalendars.ts";
import { CalendarConnectionsDialog } from "./CalendarConnectionsDialog.tsx";

const LINK =
  "https://moodle.uni.edu/calendar/export_execute.php?userid=7&authtoken=abc&preset_what=all";

const MOODLE: CalendarConnection = {
  provider: "moodle",
  account: "moodle.uni.edu",
  calendars: [{ id: "moodle", name: "moodle.uni.edu", color: null, selected: true }],
  lastSyncedAt: null,
  lastError: null,
};

function setup(connections: CalendarConnection[] = []) {
  mockCommand("external_calendar_status", { googleAvailable: true, connections });
  mockCommand("sync_external_calendars", connections);
  return renderWithProviders(<CalendarConnectionsDialog open onOpenChange={() => {}} />);
}

describe("CalendarConnectionsDialog Moodle", () => {
  it("offers to connect Moodle with a calendar link", async () => {
    setup();
    expect(await screen.findByText("Moodle")).toBeTruthy();
    expect(screen.getByLabelText(/Calendar link/)).toBeTruthy();
    await expectNoA11yViolations();
  });

  it("sends the pasted link to connect", async () => {
    mockCommandWith("connect_moodle_calendar", () => MOODLE);
    setup();
    await userEvent.type(await screen.findByLabelText(/Calendar link/), LINK);
    await userEvent.click(screen.getByRole("button", { name: "Connect Moodle" }));
    await waitFor(() => expect(callsOf("connect_moodle_calendar")).toEqual([{ link: LINK }]));
  });

  it("shows the backend's reason when the link is refused", async () => {
    mockCommandWith("connect_moodle_calendar", () => {
      throw new Error("Moodle rejected the calendar link.");
    });
    setup();
    await userEvent.type(await screen.findByLabelText(/Calendar link/), LINK);
    await userEvent.click(screen.getByRole("button", { name: "Connect Moodle" }));
    expect(await screen.findByText(/Moodle rejected the calendar link/)).toBeTruthy();
  });

  it("does not send an empty link", async () => {
    setup();
    await userEvent.click(await screen.findByRole("button", { name: "Connect Moodle" }));
    expect(await screen.findByText("Paste the calendar link from Moodle")).toBeTruthy();
    expect(callsOf("connect_moodle_calendar")).toEqual([]);
  });

  it("lists a connected Moodle site", async () => {
    setup([MOODLE]);
    expect(await screen.findByText("Waiting for the first update")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeTruthy();
  });
});
