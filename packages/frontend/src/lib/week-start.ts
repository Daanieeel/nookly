import { useDateTimeSettings } from "#/lib/datetime.ts";
import type { SettingValue } from "#/lib/settings/registry.ts";
import { settings, useSetting } from "#/lib/settings/settings.ts";

/// A `date-fns` `weekStartsOn`: Sunday, Monday or Saturday.
export type WeekStart = 0 | 1 | 6;

const DAYS = { monday: 1, sunday: 0, saturday: 6 } as const;

/// The first day of the week for a `calendar.weekStart` value. `auto` is `automatic`,
/// which each place picks for itself.
export function resolveWeekStart(
  setting: SettingValue<"calendar.weekStart">,
  automatic: WeekStart,
): WeekStart {
  return setting === "auto" ? automatic : DAYS[setting];
}

/// What `auto` means in calendars and date pickers: American weeks start on Sunday.
function automaticFor(dateFormat: string): WeekStart {
  return dateFormat === "american" ? 0 : 1;
}

/// The first day of the week, re-rendering when the setting or the date format changes.
export function useWeekStartsOn(): WeekStart {
  const [setting] = useSetting("calendar.weekStart");
  const dateFormat = useDateTimeSettings((s) => s.dateFormat);
  return resolveWeekStart(setting, automaticFor(dateFormat));
}

/// The same outside React, for code that runs per call.
export function currentWeekStartsOn(): WeekStart {
  const { dateFormat } = useDateTimeSettings.getState();
  return resolveWeekStart(settings.get("calendar.weekStart"), automaticFor(dateFormat));
}

/// The first day of the week for places that count weeks from Monday unless told
/// otherwise, like the assignment buckets.
export function mondayWeekStartsOn(): WeekStart {
  return resolveWeekStart(settings.get("calendar.weekStart"), 1);
}
