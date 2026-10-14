import type { WeekStart } from "@nookly/shared/calendar-grid";
import { useDateTimeSettings } from "#/lib/datetime.ts";
import { settings, useSetting } from "#/lib/settings/settings.ts";

import { automaticWeekStart, resolveWeekStart } from "@nookly/shared/calendar-grid";

/// A `date-fns` `weekStartsOn`: Sunday, Monday or Saturday.
export type { WeekStart } from "@nookly/shared/calendar-grid";
export { resolveWeekStart };

/// The first day of the week, re-rendering when the setting or the date format changes.
export function useWeekStartsOn(): WeekStart {
  const [setting] = useSetting("calendar.weekStart");
  const dateFormat = useDateTimeSettings((s) => s.dateFormat);
  return resolveWeekStart(setting, automaticWeekStart(dateFormat));
}

/// The same outside React, for code that runs per call.
export function currentWeekStartsOn(): WeekStart {
  const { dateFormat } = useDateTimeSettings.getState();
  return resolveWeekStart(settings.get("calendar.weekStart"), automaticWeekStart(dateFormat));
}

/// The first day of the week for places that count weeks from Monday unless told
/// otherwise, like the assignment buckets.
export function mondayWeekStartsOn(): WeekStart {
  return resolveWeekStart(settings.get("calendar.weekStart"), 1);
}
