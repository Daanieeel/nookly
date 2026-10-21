/// A day as the desktop stores it (`YYYY-MM-DD`), in the phone's own time zone.
export function localDay(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return localDay(new Date(y, m - 1, d + days));
}

/// "Today", "Tomorrow", or a short weekday and date.
export function dayLabel(day: string, today = localDay()): string {
  if (day === today) return "Today";
  if (day === addDays(today, 1)) return "Tomorrow";
  if (day === addDays(today, -1)) return "Yesterday";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function greeting(now = new Date()): string {
  const hour = now.getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/// How long ago, short: "now", "3m ago", "2h ago", "5d ago", then the date.
export function ago(iso: string, now = new Date()): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h ago`;
  if (minutes < 60 * 24 * 30) return `${Math.floor(minutes / (60 * 24))}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/// The week number of a day, ISO style (the week with its Thursday in the year).
export function isoWeek(date: Date): number {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  return Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

/// The dates a calendar view covers, for its header: one day with its weekday, or the
/// first and the last.
export function periodTitle(first: string, last: string): string {
  const date = (day: string) => {
    const [y, m, d] = day.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  if (first === last) {
    return date(first).toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  }
  const short = (day: string) =>
    date(day).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `${short(first)} to ${short(last)}`;
}

/// A calendar view's header: its dates and its week (that of the middle day, so a week
/// that starts on a Sunday still reads as the ISO week most of it falls in).
export function periodHeader(days: string[]): string {
  const middle = days[Math.floor(days.length / 2)];
  const [y, m, d] = middle.split("-").map(Number);
  return `${periodTitle(days[0], days[days.length - 1])}, Week ${isoWeek(new Date(y, m - 1, d))}`;
}
