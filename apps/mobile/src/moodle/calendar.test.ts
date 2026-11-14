import type { Http } from "./api.ts";
import {
  type CalendarStore,
  moodleCalendar,
  normalizeFeedUrl,
  parseFeed,
  toAgendaItems,
} from "./calendar.ts";

const LINK =
  "https://moodle.uni.edu/calendar/export_execute.php?userid=7&authtoken=secret&preset_what=all&preset_time=recentupcoming";

const FEED = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:1@moodle.uni.edu",
  "SUMMARY:Sheet 1 is due",
  "DTSTART:20261120T225900Z",
  "DTEND:20261120T225900Z",
  "LOCATION:Room 1\\, Main",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:2@moodle.uni.edu",
  "SUMMARY:A long title that Moodle folds",
  "  over two lines",
  "DTSTART;VALUE=DATE:20261124",
  "DTEND;VALUE=DATE:20261125",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:3@moodle.uni.edu",
  "SUMMARY:Cancelled lecture",
  "STATUS:CANCELLED",
  "DTSTART:20261121T090000Z",
  "DTEND:20261121T100000Z",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("a Moodle calendar link", () => {
  it("takes Moodle's export link, webcal ones as https", () => {
    expect(normalizeFeedUrl(` ${LINK} `)).toBe(LINK);
    expect(normalizeFeedUrl(LINK.replace("https://", "webcal://"))).toBe(LINK);
  });

  it("refuses anything that is not one, or would send the token in the clear", () => {
    for (const bad of [
      "moodle.uni.edu",
      LINK.replace("https://", "http://"),
      LINK.replace("authtoken=secret", "authtoken="),
      "https://moodle.uni.edu/calendar/view.php?authtoken=secret",
    ]) {
      expect(() => normalizeFeedUrl(bad)).toThrow("That doesn't look like a Moodle calendar link.");
    }
  });
});

describe("reading the feed", () => {
  it("reads each event, a deadline as one moment, all day ones by their days", () => {
    expect(parseFeed(FEED)).toEqual([
      {
        id: "moodle:1@moodle.uni.edu:2026-11-20T22:59:00Z",
        title: "Sheet 1 is due",
        location: "Room 1, Main",
        allDay: false,
        start: "2026-11-20T22:59:00Z",
        end: "2026-11-20T22:59:00Z",
      },
      {
        id: "moodle:2@moodle.uni.edu:2026-11-24",
        title: "A long title that Moodle folds over two lines",
        location: null,
        allDay: true,
        start: "2026-11-24",
        end: "2026-11-25",
      },
    ]);
  });

  it("puts timed events on the phone's own day and clock, all day ones on their days", () => {
    const [deadline, allDay] = toAgendaItems(parseFeed(FEED), "2026-11-01", "2026-11-30");
    const at = new Date("2026-11-20T22:59:00Z");
    const pad = (n: number) => String(n).padStart(2, "0");
    expect(deadline).toMatchObject({
      id: "moodle:1@moodle.uni.edu:2026-11-20T22:59:00Z",
      kind: "calendar_entry",
      title: "Sheet 1 is due",
      date: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
      startTime: `${pad(at.getHours())}:${pad(at.getMinutes())}`,
      allDay: false,
    });
    expect(allDay).toMatchObject({ date: "2026-11-24", endDate: null, allDay: true });
    expect(toAgendaItems(parseFeed(FEED), "2026-12-01", "2026-12-31")).toEqual([]);
  });
});

function fakeCalendar() {
  const keys = new Map<string, string>();
  const files = new Map<string, string>();
  const asked: string[] = [];
  const state = { online: true, body: FEED, asked };
  const http: Http = async (url) => {
    state.asked.push(url);
    if (!state.online) throw new TypeError("Network request failed");
    return { ok: true, status: 200, text: async () => state.body };
  };
  const store: CalendarStore = {
    read: async () => files.get("calendar") ?? null,
    write: async (body) => void files.set("calendar", body),
    clear: async () => void files.delete("calendar"),
  };
  const calendar = moodleCalendar({
    http,
    keys: {
      getItemAsync: async (key) => keys.get(key) ?? null,
      setItemAsync: async (key, value) => void keys.set(key, value),
      deleteItemAsync: async (key) => void keys.delete(key),
    },
    store,
    now: () => Date.parse("2026-11-14T12:00:00Z"),
  });
  return { keys, files, state, calendar };
}

describe("the Moodle calendar connection", () => {
  it("connects with the link, keeping it in the keychain and the events on the phone", async () => {
    const { keys, files, state, calendar } = fakeCalendar();
    const connected = await calendar.connect(LINK);
    expect(connected).toMatchObject({ site: "moodle.uni.edu", error: null });
    expect(connected?.events).toHaveLength(2);
    expect(state.asked).toEqual([LINK]);
    expect(keys.get("calendar.moodle.link")).toBe(LINK);
    expect(files.get("calendar")).not.toContain("secret");
    expect(await calendar.load()).toEqual(connected);
  });

  it("keeps the last events and says what went wrong when Moodle can't be reached", async () => {
    const { state, calendar } = fakeCalendar();
    await calendar.connect(LINK);
    state.online = false;
    const synced = await calendar.sync();
    expect(synced?.events).toHaveLength(2);
    expect(synced?.error).toBe("Nookly couldn't reach Moodle. It shows the events it read last.");
  });

  it("refuses a link whose answer is not a calendar", async () => {
    const { keys, state, calendar } = fakeCalendar();
    state.body = "<html>Sign in</html>";
    await expect(calendar.connect(LINK)).rejects.toThrow(
      "Moodle didn't answer with a calendar. Check the link and try again.",
    );
    expect(keys.size).toBe(0);
    expect(await calendar.load()).toBeNull();
  });

  it("forgets the link and the events on disconnect", async () => {
    const { keys, files, calendar } = fakeCalendar();
    await calendar.connect(LINK);
    await calendar.disconnect();
    expect(keys.size).toBe(0);
    expect(files.size).toBe(0);
    expect(await calendar.load()).toBeNull();
    expect(await calendar.sync()).toBeNull();
  });
});
