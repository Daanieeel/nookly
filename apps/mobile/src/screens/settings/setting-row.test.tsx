import type { SharedSettingId } from "@nookly/shared/settings";
import { fireEvent } from "expo-router/testing-library";
import { phoneSettings } from "../../data/settings.ts";
import { renderScreens, testData } from "../../test/render.tsx";
import { choose } from "../../test/sheet.ts";
import { SettingRow } from "./SettingRow.tsx";

const IDS: SharedSettingId[] = [
  "general.timezone",
  "general.dateFormat",
  "general.timeFormat",
  "appearance.theme",
  "appearance.fileViewerTheme",
  "notes.defaultCodeLanguage",
  "calendar.dayStartHour",
];

afterEach(() => {
  for (const id of IDS) phoneSettings.reset(id);
});

const row = (id: SharedSettingId) =>
  renderScreens({ index: () => <SettingRow id={id} /> }, testData());

describe("a setting", () => {
  it("shows its key above its title, as the desktop does", async () => {
    const screen = await row("general.timezone");
    expect(await screen.findByText("general.timezone")).toBeTruthy();
  });

  it("picks a time zone from a searchable list with each zone's flag", async () => {
    const screen = await row("general.timezone");
    await fireEvent.press(await screen.findByRole("button", { name: /^Time zone, / }));
    await fireEvent.changeText(await screen.findByLabelText("Search Time zone"), "Berlin");
    const berlin = await screen.findByRole("radio", {
      name: /^Europe\/Berlin/,
    });
    expect(screen.getAllByText("🇩🇪").length).toBeGreaterThan(0);
    await fireEvent.press(berlin);
    expect(phoneSettings.get("general.timezone")).toBe("Europe/Berlin");
    // Every zone on Earth is listed: slow to draw on a busy machine.
  }, 15_000);

  it("names the date and time formats as the desktop does, with their flags", async () => {
    const screen = await row("general.dateFormat");
    await choose(screen, "Date format", "European (DD.MM.YYYY)");
    expect(phoneSettings.get("general.dateFormat")).toBe("european");
    expect(screen.getAllByText("🇪🇺").length).toBeGreaterThan(0);
    const time = await row("general.timeFormat");
    await choose(time, "Time format", "American (12 hour)");
    expect(phoneSettings.get("general.timeFormat")).toBe("american");
  });

  it("shows the themes as cards with a preview of each, as the desktop does", async () => {
    const screen = await row("appearance.theme");
    expect(await screen.findByLabelText("Theme")).toBeTruthy();
    expect(screen.getAllByRole("radio").map((r) => r.props.accessibilityLabel)).toEqual([
      "Light",
      "Dark",
      "System",
    ]);
    await fireEvent.press(screen.getByRole("radio", { name: "Dark" }));
    expect(phoneSettings.get("appearance.theme")).toBe("dark");
    const viewer = await row("appearance.fileViewerTheme");
    await fireEvent.press(await viewer.findByRole("radio", { name: "Use Defaults" }));
    expect(phoneSettings.get("appearance.fileViewerTheme")).toBe("defaults");
  });

  it("picks the default code language from the desktop's languages", async () => {
    const screen = await row("notes.defaultCodeLanguage");
    await choose(screen, "Default code language", "TypeScript");
    expect(phoneSettings.get("notes.defaultCodeLanguage")).toBe("typescript");
  });

  it("takes a number with the desktop's minus, plus and typing", async () => {
    const screen = await row("calendar.dayStartHour");
    const start = Number(phoneSettings.get("calendar.dayStartHour"));
    await fireEvent.press(await screen.findByRole("button", { name: "Increase Day starts at" }));
    expect(phoneSettings.get("calendar.dayStartHour")).toBe(start + 1);
    await fireEvent.changeText(screen.getByLabelText("Day starts at"), "9");
    await fireEvent(screen.getByLabelText("Day starts at"), "endEditing");
    expect(phoneSettings.get("calendar.dayStartHour")).toBe(9);
  });
});
