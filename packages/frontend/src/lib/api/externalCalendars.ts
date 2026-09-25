import { invoke } from "@tauri-apps/api/core";

/// External calendars are a read only overlay on the Sessions calendar, never
/// entities. See `src-tauri/src/external_calendars/mod.rs`.
export type CalendarProvider = "google" | "icloud";

export interface RemoteCalendar {
  id: string;
  name: string;
  color: string | null;
  selected: boolean;
}

export interface CalendarConnection {
  provider: CalendarProvider;
  account: string;
  calendars: RemoteCalendar[];
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface ExternalCalendarStatus {
  googleAvailable: boolean;
  connections: CalendarConnection[];
}

/// Timed events carry UTC ISO instants; all day events carry `YYYY-MM-DD` dates
/// with an exclusive `end`.
export interface ExternalEvent {
  id: string;
  provider: CalendarProvider;
  calendarId: string;
  calendarName: string;
  color: string | null;
  title: string;
  location: string | null;
  allDay: boolean;
  start: string;
  end: string;
}

export function externalCalendarStatus(): Promise<ExternalCalendarStatus> {
  return invoke("external_calendar_status");
}

/// Opens the browser for Google's sign in and resolves once it completes.
export function connectGoogleCalendar(): Promise<CalendarConnection> {
  return invoke("connect_google_calendar");
}

export function cancelGoogleCalendarConnect(): Promise<void> {
  return invoke("cancel_google_calendar_connect");
}

export function connectIcloudCalendar(
  appleId: string,
  appPassword: string,
): Promise<CalendarConnection> {
  return invoke("connect_icloud_calendar", { appleId, appPassword });
}

export function setExternalCalendarSelected(
  provider: CalendarProvider,
  calendarId: string,
  selected: boolean,
): Promise<CalendarConnection> {
  return invoke("set_external_calendar_selected", { provider, calendarId, selected });
}

export function disconnectExternalCalendar(provider: CalendarProvider): Promise<void> {
  return invoke("disconnect_external_calendar", { provider });
}

/// Fetches from every connected provider; failures are recorded per connection.
export function syncExternalCalendars(): Promise<CalendarConnection[]> {
  return invoke("sync_external_calendars");
}

/// Cached events of selected calendars from `from` through `to` (`YYYY-MM-DD`).
export function listExternalEvents(from: string, to: string): Promise<ExternalEvent[]> {
  return invoke("list_external_events", { from, to });
}
