import { invoke } from "@tauri-apps/api/core";
import type { Entity, OccurrenceOverride, SessionOccurrence } from "./types";

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
