import { invoke } from "@tauri-apps/api/core";
import type { CalendarEntry, CalendarEntryOverride, CalendarEntryTemplate, Entity } from "./types";

export function createCalendarEntryTemplate(
  spaceId: string,
  title: string,
  recurrence: "daily" | "weekly" | "monthly",
  startTime: string | null,
  endTime: string | null,
  allDay: boolean,
  location: string | null,
  description: string | null,
  anchorDate: string,
): Promise<Entity> {
  return invoke("create_calendar_entry_template", {
    spaceId,
    title,
    recurrence,
    startTime,
    endTime,
    allDay,
    location,
    description,
    anchorDate,
  });
}

export function generateCalendarEntryOccurrences(
  templateId: string,
  untilDate: string,
): Promise<CalendarEntry[]> {
  return invoke("generate_calendar_entry_occurrences", { templateId, untilDate });
}

export function createOneOffCalendarEntry(
  spaceId: string,
  title: string,
  date: string,
  startTime: string | null,
  endTime: string | null,
  allDay: boolean,
  location: string | null,
  description: string | null,
  /// Set only for a multi-day entry (inclusive); omit for a single day, `date` alone.
  endDate: string | null = null,
): Promise<CalendarEntry> {
  return invoke("create_one_off_calendar_entry", {
    spaceId,
    title,
    date,
    endDate,
    startTime,
    endTime,
    allDay,
    location,
    description,
  });
}

export function overrideCalendarEntryOccurrence(
  entityId: string,
  patch: CalendarEntryOverride,
): Promise<CalendarEntry> {
  return invoke("override_calendar_entry_occurrence", { entityId, patch });
}

export function listCalendarEntries(spaceId: string): Promise<CalendarEntry[]> {
  return invoke("list_calendar_entries", { spaceId });
}

/// Every calendar entry across every Space, for the unified cross-Space Calendar page.
export function listCalendarEntriesAll(): Promise<CalendarEntry[]> {
  return invoke("list_calendar_entries_all");
}

export function listCalendarEntryTemplates(spaceId: string): Promise<CalendarEntryTemplate[]> {
  return invoke("list_calendar_entry_templates", { spaceId });
}

/// A change to a recurring series; omitted fields stay as they are.
export interface CalendarEntrySeriesPatch {
  title?: string;
  startTime?: string | null;
  endTime?: string | null;
  allDay?: boolean;
  location?: string | null;
  description?: string | null;
}

/// Edits the template and its occurrences from `fromDate` on. Earlier ones are
/// never rewritten, and fields an occurrence overrode on its own keep their value.
export function updateCalendarEntrySeries(
  templateId: string,
  fromDate: string,
  patch: CalendarEntrySeriesPatch,
): Promise<void> {
  return invoke("update_calendar_entry_series", { templateId, fromDate, patch });
}

/// Moves the series' occurrences from `fromDate` on to Trash; returns how many.
export function deleteCalendarEntrySeries(templateId: string, fromDate: string): Promise<number> {
  return invoke("delete_calendar_entry_series", { templateId, fromDate });
}
