import type { AgendaItem } from "@nookly/shared/data";
import { z } from "zod";
import { addDays, localDay } from "../screens/dates.ts";
import type { Http } from "./api.ts";
import type { KeyStore } from "./connection.ts";

/// Moodle's deadlines on the phone's calendar, as on the desktop
/// (`external_calendars/moodle.rs`): the calendar export link every Moodle site offers (a
/// plain iCalendar feed behind a token of its own, so it works with single sign on too),
/// read only, drawn beside the Sessions and never one of them. The link carries the token,
/// so it lives in the keychain; the events are kept on the phone to show offline.

const BAD_LINK =
  "That doesn't look like a Moodle calendar link. In Moodle, open Calendar, choose Import or export calendars, then Export calendar, and copy the link it gives you.";
const NOT_A_CALENDAR = "Moodle didn't answer with a calendar. Check the link and try again.";
const UNREACHABLE = "Nookly couldn't reach Moodle. It shows the events it read last.";

const LINK_KEY = "calendar.moodle.link";

/// Checks a pasted link and turns `webcal://` into `https://`. A feed with a token never
/// travels over plain `http`.
export function normalizeFeedUrl(input: string): string {
  const trimmed = input.trim().replace(/^webcal:\/\//i, "https://");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(BAD_LINK);
  }
  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    !url.pathname.endsWith("/export_execute.php") ||
    !url.searchParams.get("authtoken")
  ) {
    throw new Error(BAD_LINK);
  }
  return trimmed;
}

/// One event of the feed. `start` and `end` (exclusive) are UTC moments
/// (`2026-11-20T22:59:00Z`) for timed events and days (`2026-11-24`) for all day ones.
export interface FeedEvent {
  id: string;
  title: string;
  location: string | null;
  allDay: boolean;
  start: string;
  end: string;
}

const unescape = (value: string) =>
  value.replace(/\\([\\,;nN])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));

const moment = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, "Z");

/// A DATE or DATE-TIME value: a day, a UTC moment, or a time with no zone, read on the
/// phone's clock.
function readTime(value: string, params: string): { allDay: boolean; at: string } | null {
  const day = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (day || /VALUE=DATE(;|$)/i.test(params)) {
    if (!day) return null;
    return { allDay: true, at: `${day[1]}-${day[2]}-${day[3]}` };
  }
  const time = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value);
  if (!time) return null;
  const [y = 0, mo = 1, d = 1, h = 0, mi = 0, s = 0] = time.slice(1, 7).map(Number);
  const date =
    time[7] === "Z" ? new Date(Date.UTC(y, mo - 1, d, h, mi, s)) : new Date(y, mo - 1, d, h, mi, s);
  return { allDay: false, at: moment(date) };
}

/// A DURATION (`P1D`, `PT1H30M`) in seconds.
function durationOf(value: string): number | null {
  const parts = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(
    value,
  );
  if (!parts) return null;
  const [, sign, w, d, h, m, s] = parts;
  const seconds =
    Number(w ?? 0) * 604800 +
    Number(d ?? 0) * 86400 +
    Number(h ?? 0) * 3600 +
    Number(m ?? 0) * 60 +
    Number(s ?? 0);
  return sign === "-" ? -seconds : seconds;
}

/// The events of an iCalendar feed, cancelled ones left out. Moodle writes each deadline as
/// one event that starts and ends at the same moment; a repeating event shows its first time.
export function parseFeed(ics: string): FeedEvent[] {
  const lines = ics.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const events: FeedEvent[] = [];
  let current: Map<string, { params: string; value: string }> | null = null;
  for (const line of lines) {
    if (/^BEGIN:VEVENT$/i.test(line)) {
      current = new Map();
      continue;
    }
    if (/^END:VEVENT$/i.test(line)) {
      const event = current ? eventOf(current) : null;
      if (event) events.push(event);
      current = null;
      continue;
    }
    if (!current) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const head = line.slice(0, colon);
    const semicolon = head.indexOf(";");
    const name = (semicolon < 0 ? head : head.slice(0, semicolon)).toUpperCase();
    if (!current.has(name)) {
      current.set(name, {
        params: semicolon < 0 ? "" : head.slice(semicolon + 1),
        value: line.slice(colon + 1),
      });
    }
  }
  return events;
}

function eventOf(props: Map<string, { params: string; value: string }>): FeedEvent | null {
  if (props.get("STATUS")?.value.toUpperCase() === "CANCELLED") return null;
  const startProp = props.get("DTSTART");
  const start = startProp ? readTime(startProp.value, startProp.params) : null;
  if (!start) return null;
  const endProp = props.get("DTEND");
  const duration = props.get("DURATION");
  let end = endProp ? readTime(endProp.value, endProp.params)?.at : undefined;
  if (!end && duration) {
    const seconds = durationOf(duration.value);
    if (seconds !== null) {
      end = start.allDay
        ? addDays(start.at, Math.round(seconds / 86400))
        : moment(new Date(Date.parse(start.at) + seconds * 1000));
    }
  }
  end ??= start.allDay ? addDays(start.at, 1) : start.at;
  const uid = props.get("UID")?.value ?? "";
  const location = unescape(props.get("LOCATION")?.value ?? "").trim();
  return {
    id: `moodle:${uid}:${start.at}`,
    title: unescape(props.get("SUMMARY")?.value ?? "").trim(),
    location: location || null,
    allDay: start.allDay,
    start: start.at,
    end,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");
const clock = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

/// The prefix of every overlay event's id: they are not Nookly's, so they open no page.
export const FEED_PREFIX = "moodle:";

export const isFeedItem = (item: { id: string }) => item.id.startsWith(FEED_PREFIX);

/// The events between `from` and `to` (days, inclusive) as the calendar draws its items: on
/// the phone's own day and clock.
export function toAgendaItems(events: FeedEvent[], from: string, to: string): AgendaItem[] {
  const items: AgendaItem[] = [];
  for (const event of events) {
    let item: AgendaItem;
    if (event.allDay) {
      const last = addDays(event.end, -1);
      item = {
        id: event.id,
        kind: "calendar_entry",
        spaceId: "",
        title: event.title,
        date: event.start,
        endDate: last > event.start ? last : null,
        startTime: null,
        endTime: null,
        allDay: true,
        location: event.location,
        description: null,
      };
    } else {
      const start = new Date(event.start);
      const end = new Date(event.end);
      const sameDay = localDay(end) === localDay(start);
      item = {
        id: event.id,
        kind: "calendar_entry",
        spaceId: "",
        title: event.title,
        date: localDay(start),
        endDate: null,
        startTime: clock(start),
        endTime: end > start && sameDay ? clock(end) : null,
        allDay: false,
        location: event.location,
        description: null,
      };
    }
    if (item.date <= to && (item.endDate ?? item.date) >= from) items.push(item);
  }
  return items;
}

const feedEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  location: z.string().nullable(),
  allDay: z.boolean(),
  start: z.string(),
  end: z.string(),
});

const keptSchema = z.object({
  site: z.string(),
  syncedAt: z.number().nullable(),
  error: z.string().nullable(),
  events: z.array(feedEventSchema),
});

/// The connection as the phone keeps it: the site, when it last read the feed, what went
/// wrong the last time, and the events. Never the link.
export type CalendarFeed = z.infer<typeof keptSchema>;

/// Where the events are kept: a file in the phone's own folder, or a test's memory.
export interface CalendarStore {
  read(): Promise<string | null>;
  write(body: string): Promise<void>;
  clear(): Promise<void>;
}

/// How far back and ahead the feed is kept.
const WINDOW_BACK_DAYS = 60;
const WINDOW_AHEAD_DAYS = 400;

export function moodleCalendar({
  http,
  keys,
  store,
  now = Date.now,
}: {
  http: Http;
  keys: KeyStore;
  store: CalendarStore;
  now?: () => number;
}) {
  /// The ids of the events near enough to now to keep.
  const inWindow = (events: FeedEvent[]) => {
    const today = localDay(new Date(now()));
    const from = addDays(today, -WINDOW_BACK_DAYS);
    const to = addDays(today, WINDOW_AHEAD_DAYS);
    return new Set(toAgendaItems(events, from, to).map((item) => item.id));
  };

  async function read(link: string): Promise<FeedEvent[]> {
    let response: Awaited<ReturnType<Http>>;
    try {
      response = await http(link, { method: "GET" });
    } catch {
      throw new Error(UNREACHABLE);
    }
    if (!response.ok) throw new Error(NOT_A_CALENDAR);
    const body = await response.text();
    if (!/BEGIN:VCALENDAR/i.test(body)) throw new Error(NOT_A_CALENDAR);
    const events = parseFeed(body);
    const kept = inWindow(events);
    return events.filter((e) => kept.has(e.id));
  }

  async function kept(): Promise<CalendarFeed | null> {
    const body = await store.read();
    if (body === null) return null;
    try {
      const parsed = keptSchema.safeParse(JSON.parse(body));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  async function keep(feed: CalendarFeed) {
    await store.write(JSON.stringify(feed));
    return feed;
  }

  const siteOf = (link: string) => new URL(link).hostname;

  return {
    /// What was read last, without asking Moodle; null while not connected.
    load: async (): Promise<CalendarFeed | null> => {
      const link = await keys.getItemAsync(LINK_KEY);
      if (!link) return null;
      return (await kept()) ?? { site: siteOf(link), syncedAt: null, error: null, events: [] };
    },

    /// Connects with a pasted link: only once Moodle answers with a calendar is it kept.
    connect: async (input: string): Promise<CalendarFeed> => {
      const link = normalizeFeedUrl(input);
      const events = await read(link);
      await keys.setItemAsync(LINK_KEY, link);
      return keep({ site: siteOf(link), syncedAt: now(), error: null, events });
    },

    /// Reads the feed again; when that fails the last events stay, with what went wrong.
    sync: async (): Promise<CalendarFeed | null> => {
      const link = await keys.getItemAsync(LINK_KEY);
      if (!link) return null;
      try {
        const events = await read(link);
        return await keep({ site: siteOf(link), syncedAt: now(), error: null, events });
      } catch (error) {
        const last = (await kept()) ?? {
          site: siteOf(link),
          syncedAt: null,
          error: null,
          events: [],
        };
        return keep({ ...last, error: error instanceof Error ? error.message : UNREACHABLE });
      }
    },

    disconnect: async () => {
      await keys.deleteItemAsync(LINK_KEY);
      await store.clear();
    },
  };
}

export type MoodleCalendar = ReturnType<typeof moodleCalendar>;
