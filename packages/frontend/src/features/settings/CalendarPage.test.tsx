import { act, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { SETTING_IDS } from "#/lib/settings/registry.ts";
import { settings } from "#/lib/settings/settings.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { CalendarPage } from "./CalendarPage.tsx";
import { SettingsDialog } from "./SettingsDialog.tsx";

const CALENDAR_IDS = SETTING_IDS.filter((id) => id.startsWith("calendar."));

function preview() {
  return screen.getByTestId("calendar-preview");
}

function days() {
  return within(preview()).getAllByTestId("preview-day");
}

function renderPage() {
  return renderWithProviders(<CalendarPage />);
}

beforeEach(() => {
  for (const id of CALENDAR_IDS) settings.reset(id);
  act(() => useNavStore.getState().setSettingsOpen(false));
});

describe("the Calendar page", () => {
  it("draws a week with seven days, starting on the chosen first day", () => {
    settings.set("calendar.weekStart", "saturday");
    renderPage();
    expect(days()).toHaveLength(7);
    expect(days().map((d) => d.getAttribute("data-weekday"))).toEqual([
      "6",
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);
  });

  it("follows the first day when it changes", () => {
    settings.set("calendar.weekStart", "monday");
    renderPage();
    expect(days()[0]).toHaveAttribute("data-weekday", "1");
    act(() => settings.set("calendar.weekStart", "sunday"));
    expect(days()[0]).toHaveAttribute("data-weekday", "0");
  });

  it("marks today once, tinted by the colour and intensity settings", () => {
    settings.set("calendar.todayColor", "neutral");
    settings.set("calendar.todayIntensity", "high");
    renderPage();
    const today = days().filter((d) => d.hasAttribute("data-today"));
    expect(today).toHaveLength(1);
    expect(today[0]?.className).toContain("bg-foreground/14");
    act(() => {
      settings.set("calendar.todayColor", "primary");
      settings.set("calendar.todayIntensity", "low");
    });
    expect(days().find((d) => d.hasAttribute("data-today"))?.className).toContain("bg-primary/3");
  });

  it("starts its hours at the day start, and keeps showing a full stretch near midnight", () => {
    settings.set("calendar.dayStartHour", 9);
    renderPage();
    const hours = () =>
      within(preview())
        .getAllByTestId("preview-hour")
        .map((h) => Number(h.getAttribute("data-hour")));
    expect(hours()[0]).toBe(9);
    expect(hours()).toHaveLength(6);
    act(() => settings.set("calendar.dayStartHour", 23));
    expect(hours().at(-1)).toBe(23);
    expect(hours()).toHaveLength(6);
    expect(within(preview()).getByTestId("preview-day-start")).toHaveAttribute("data-hour", "23");
  });

  it("sizes a session and a calendar entry by their default lengths", () => {
    settings.set("calendar.sessionLengthMinutes", 90);
    settings.set("calendar.calendarEntryLengthMinutes", 30);
    renderPage();
    expect(within(preview()).getByTestId("preview-session")).toHaveAttribute("data-minutes", "90");
    expect(within(preview()).getByTestId("preview-entry")).toHaveAttribute("data-minutes", "30");
    act(() => settings.set("calendar.sessionLengthMinutes", 45));
    expect(within(preview()).getByTestId("preview-session")).toHaveAttribute("data-minutes", "45");
  });

  it("shows a tick for every snap step in an hour", () => {
    settings.set("calendar.snapMinutes", 15);
    renderPage();
    const ticks = () => within(preview()).getAllByTestId("preview-snap-tick");
    // Four ticks an hour, over the six hours drawn.
    expect(ticks()).toHaveLength(4 * 6);
    act(() => settings.set("calendar.snapMinutes", 30));
    expect(ticks()).toHaveLength(2 * 6);
  });

  it("is hidden from assistive technology, which gets the controls", () => {
    renderPage();
    expect(preview()).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps every calendar setting with its title, id and a reset that works", async () => {
    const { user } = renderPage();
    expect(CALENDAR_IDS).toHaveLength(7);
    for (const id of CALENDAR_IDS) {
      const field = document.querySelector<HTMLElement>(`[data-setting-id="${id}"]`);
      if (!field) throw new Error(`no field for ${id}`);
      expect(within(field).getByText(id)).toBeInTheDocument();
    }
    settings.set("calendar.sessionLengthMinutes", 45);
    await user.click(
      await screen.findByRole("button", { name: "Reset Session length to default" }),
    );
    expect(settings.get("calendar.sessionLengthMinutes")).toBe(90);
  });

  it("edits settings through the same controls as before", async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole("tab", { name: "Neutral" }));
    expect(settings.get("calendar.todayColor")).toBe("neutral");
    await user.click(screen.getByRole("button", { name: "Snap to" }));
    await user.click(await screen.findByRole("option", { name: "30 minutes" }));
    expect(settings.get("calendar.snapMinutes")).toBe(30);
  });

  it("has no axe violations", async () => {
    renderPage();
    await expectNoA11yViolations();
  });
});

describe("the Calendar page in Settings", () => {
  it("replaces the plain rows, and search still finds the settings as rows", async () => {
    const { user } = renderWithProviders(<SettingsDialog />);
    act(() => useNavStore.getState().setSettingsOpen(true));
    await user.click(await screen.findByRole("button", { name: "Calendar" }));
    expect(screen.getByTestId("calendar-preview")).toBeInTheDocument();
    await user.type(screen.getByRole("searchbox"), "monday");
    expect(screen.queryByTestId("calendar-preview")).toBeNull();
    expect(document.querySelector('[data-setting-id="calendar.weekStart"]')).not.toBeNull();
  });
});
