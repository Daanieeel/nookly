import { invoke } from "@tauri-apps/api/core";
import type { BriefingSession, Entity, OccurrenceOverride, SessionOccurrence } from "./types";

export function createSessionTemplate(
  spaceId: string,
  title: string,
  courseId: string,
  weekday: number,
  startTime: string,
  endTime: string,
  location: string | null,
  anchorDate: string,
): Promise<Entity> {
  return invoke("create_session_template", {
    spaceId,
    title,
    courseId,
    weekday,
    startTime,
    endTime,
    location,
    anchorDate,
  });
}

export function generateOccurrences(
  templateId: string,
  untilDate: string,
): Promise<SessionOccurrence[]> {
  return invoke("generate_occurrences", { templateId, untilDate });
}

export function createOneOffSession(
  spaceId: string,
  title: string,
  courseId: string,
  date: string,
  startTime: string,
  endTime: string,
  location: string | null,
): Promise<SessionOccurrence> {
  return invoke("create_one_off_session", {
    spaceId,
    title,
    courseId,
    date,
    startTime,
    endTime,
    location,
  });
}

export function overrideOccurrence(
  entityId: string,
  patch: OccurrenceOverride,
): Promise<SessionOccurrence> {
  return invoke("override_occurrence", { entityId, patch });
}

export function listSessions(spaceId: string): Promise<SessionOccurrence[]> {
  return invoke("list_sessions", { spaceId });
}

export function listSessionsToday(): Promise<BriefingSession[]> {
  return invoke("list_sessions_today");
}

/// Sessions from `from` through `to` (inclusive local `YYYY-MM-DD` days) across every Space.
export function listSessionsBetween(from: string, to: string): Promise<BriefingSession[]> {
  return invoke("list_sessions_between", { from, to });
}

/// A change to a recurring series; omitted fields stay as they are.
export interface SeriesPatch {
  title?: string;
  startTime?: string;
  endTime?: string;
  location?: string | null;
}

/// Edits the template and its occurrences from `fromDate` on. Earlier ones are
/// never rewritten, and fields an occurrence overrode on its own keep their value.
export function updateSessionSeries(
  templateId: string,
  fromDate: string,
  patch: SeriesPatch,
): Promise<void> {
  return invoke("update_session_series", { templateId, fromDate, patch });
}

/// Moves the series' occurrences from `fromDate` on to Trash; returns how many.
export function deleteSessionSeries(templateId: string, fromDate: string): Promise<number> {
  return invoke("delete_session_series", { templateId, fromDate });
}

export interface SessionPages {
  jot: Entity | null;
  note: Entity | null;
}

/// The Jot and Note of one occurrence, when they exist and aren't in Trash.
export function getSessionPages(sessionId: string): Promise<SessionPages> {
  return invoke("get_session_pages", { sessionId });
}

/// The occurrence's Jot or Note, created with `title` if it has none yet.
export function createSessionPage(
  sessionId: string,
  kind: "jot" | "note",
  title: string,
): Promise<Entity> {
  return invoke("create_session_page", { sessionId, kind, title });
}

/// Makes an existing page the occurrence's Jot or Note, unless it has a live one
/// already; resolves to whether it linked.
export function linkSessionPage(
  sessionId: string,
  kind: "jot" | "note",
  pageId: string,
): Promise<boolean> {
  return invoke("link_session_page", { sessionId, kind, pageId });
}
