import type { AgendaItem } from "@nookly/shared/data";

/// What the phone's Home leads with: the item on the calendar going on right now, or the
/// next one to start today, and how many minutes are left of it or until it.
export interface UpNext {
  item: AgendaItem;
  now: boolean;
  minutes: number;
}

const minutesOf = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

/// The timed item on `today` going on at `time` ("HH:MM"), else the next one to start. One
/// without an end counts as over once it has started. All day items are not "up next".
export function upNext(items: AgendaItem[], today: string, time: string): UpNext | null {
  const at = minutesOf(time);
  const timed = items
    .filter((i) => i.date === today && !i.allDay && i.startTime !== null)
    .map((item) => ({
      item,
      start: minutesOf(item.startTime ?? "00:00"),
      end: item.endTime ? minutesOf(item.endTime) : null,
    }))
    .sort((a, b) => a.start - b.start);
  const current = timed.find((t) => t.start <= at && t.end !== null && at < t.end);
  if (current) return { item: current.item, now: true, minutes: (current.end ?? at) - at };
  const next = timed.find((t) => t.start >= at);
  return next ? { item: next.item, now: false, minutes: next.start - at } : null;
}

const span = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h > 0 ? `${h} h` : null, m > 0 || h === 0 ? `${m} min` : null].filter(Boolean).join(" ");
};

/// "In 25 min", "In 1 h 35 min", or for what is on now "Now, 10 min left".
export function untilText({ now, minutes }: { now: boolean; minutes: number }): string {
  if (now) return `Now, ${span(minutes)} left`;
  return minutes === 0 ? "Starting now" : `In ${span(minutes)}`;
}
