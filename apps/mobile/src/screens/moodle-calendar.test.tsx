import { fireEvent, waitFor } from "expo-router/testing-library";
import { fakeMoodle } from "../test/fake-moodle.tsx";
import { renderScreens, testData } from "../test/render.tsx";
import { CalendarScreen } from "./CalendarScreen.tsx";
import { CalendarConnectionsPage } from "./settings/CalendarConnectionsPage.tsx";
import { ExternalEventScreen } from "./ExternalEventScreen.tsx";

const FEED_URL = "https://moodle.uni.edu/calendar/export_execute.php";
const LINK = `${FEED_URL}?userid=7&authtoken=secret&preset_what=all`;

/// A deadline two days from now at noon on the phone's clock, as Moodle writes it (UTC).
function deadline() {
  const at = new Date();
  at.setDate(at.getDate() + 2);
  at.setHours(12, 0, 0, 0);
  const ics = at
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:9@moodle.uni.edu",
    "SUMMARY:Sheet 1 is due",
    `DTSTART:${ics}`,
    `DTEND:${ics}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

describe("Moodle deadlines on the calendar", () => {
  it("connects with the calendar link from Moodle, and disconnects", async () => {
    const moodle = fakeMoodle({}, { [FEED_URL]: deadline() });
    const screen = await renderScreens(
      { index: moodle.wrap(<CalendarConnectionsPage />) },
      testData(),
    );
    await fireEvent.changeText(await screen.findByLabelText("Calendar link"), "moodle.uni.edu");
    await fireEvent.press(screen.getByRole("button", { name: "Connect Moodle" }));
    expect(await screen.findByText(/doesn't look like a Moodle calendar link/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Calendar link"), LINK);
    await fireEvent.press(screen.getByRole("button", { name: "Connect Moodle" }));
    expect(await screen.findByText("moodle.uni.edu")).toBeTruthy();
    expect(screen.getByText("1 event")).toBeTruthy();
    expect(moodle.keys.get("calendar.moodle.link")).toBe(LINK);
    await fireEvent.press(screen.getByRole("button", { name: "Disconnect Moodle" }));
    expect(await screen.findByLabelText("Calendar link")).toBeTruthy();
    expect(moodle.keys.has("calendar.moodle.link")).toBe(false);
  });

  it("draws Moodle's deadlines beside the Sessions, read only", async () => {
    const moodle = fakeMoodle({}, { [FEED_URL]: deadline() });
    moodle.keys.set("calendar.moodle.link", LINK);
    const screen = await renderScreens(
      moodle.routes({
        index: () => <CalendarScreen />,
        "calendar-event": () => <ExternalEventScreen id="moodle:9@moodle.uni.edu" />,
      }),
      testData(),
      "/",
      // An iPad's window, where the calendar has its desktop views.
      { width: 834 },
    );
    await fireEvent.press(await screen.findByRole("radio", { name: "Agenda" }));
    const row = await screen.findByRole("button", { name: "Sheet 1 is due, From Moodle, 12:00" });
    await fireEvent.press(row);
    await waitFor(() => expect(screen.getPathname()).toBe("/calendar-event"));
  });
});
