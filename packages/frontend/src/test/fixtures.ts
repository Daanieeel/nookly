import type {
  Assignment,
  Bookmark,
  CalendarEntry,
  Entity,
  Exam,
  FileEntity,
  Label,
  SessionOccurrence,
  Space,
  Task,
  TaskStatus,
} from "#/lib/api/types.ts";

/// Builders for the backend's records, each a valid default with `patch` on top.

const STAMP = "2026-01-01T00:00:00.000Z";

export function makeEntity(patch: Partial<Entity> = {}): Entity {
  return {
    id: "entity-1",
    spaceId: "space-1",
    type: "task",
    title: "Title",
    icon: null,
    pinned: false,
    createdAt: STAMP,
    updatedAt: STAMP,
    deletedAt: null,
    key: "TSK-1",
    ...patch,
  };
}

export function makeSpace(patch: Partial<Space> = {}): Space {
  return {
    id: "space-1",
    name: "Home",
    icon: null,
    color: "#3b82f6",
    createdAt: STAMP,
    updatedAt: STAMP,
    position: 0,
    ...patch,
  };
}

export function makeLabel(patch: Partial<Label> = {}): Label {
  return {
    id: "label-1",
    spaceId: "space-1",
    name: "Label",
    color: "#ef4444",
    createdAt: STAMP,
    usageCount: 0,
    ...patch,
  };
}

/// The default Tasks statuses, in order.
export const STATUSES: TaskStatus[] = [
  { id: "backlog", name: "Backlog", color: "#64748b", doneness: 0, position: 0 },
  { id: "todo", name: "Todo", color: "#64748b", doneness: 0, position: 1 },
  { id: "doing", name: "In Progress", color: "#3b82f6", doneness: 50, position: 2 },
  { id: "done", name: "Done", color: "#22c55e", doneness: 100, position: 3 },
  { id: "cancelled", name: "Cancelled", color: "#ef4444", doneness: 100, position: 4 },
];

export function makeTask(patch: Partial<Task> = {}, entity: Partial<Entity> = {}): Task {
  return {
    entity: makeEntity({ type: "task", ...entity }),
    statusId: "todo",
    startDate: null,
    dueDate: null,
    labelIds: [],
    completedAt: null,
    effort: null,
    courseIds: [],
    semesterIds: [],
    ...patch,
  };
}

export function makeAssignment(
  patch: Partial<Assignment> = {},
  entity: Partial<Entity> = {},
): Assignment {
  return {
    entity: makeEntity({ type: "assignment", key: "ASG-1", ...entity }),
    dueDate: null,
    dueSessionOffsetDays: null,
    weight: null,
    status: "not_started",
    grade: null,
    ...patch,
  };
}

export function makeBookmark(
  patch: Partial<Bookmark> = {},
  entity: Partial<Entity> = {},
): Bookmark {
  return {
    entity: makeEntity({ type: "bookmark", key: "BMK-1", ...entity }),
    url: "https://example.com",
    fetchedTitle: null,
    faviconUrl: null,
    previewImageUrl: null,
    description: null,
    metadataFetchedAt: null,
    screenshotPath: null,
    preferredImage: null,
    labelIds: [],
    ...patch,
  };
}

export function makeFile(
  patch: Partial<FileEntity> = {},
  entity: Partial<Entity> = {},
): FileEntity {
  return {
    entity: makeEntity({ type: "file", key: "FIL-1", ...entity }),
    localPath: null,
    provider: null,
    url: null,
    originalFilename: null,
    sourcePath: null,
    needsReindex: false,
    labelIds: [],
    indexedContent: null,
    ...patch,
  };
}

export function makeSession(
  patch: Partial<SessionOccurrence> = {},
  entity: Partial<Entity> = {},
): SessionOccurrence {
  return {
    entity: makeEntity({
      id: "session-1",
      type: "session",
      title: "Lecture",
      key: "SES-1",
      ...entity,
    }),
    templateId: null,
    date: "2026-03-10",
    startTime: "09:00",
    endTime: "10:00",
    cancelled: false,
    location: null,
    notes: null,
    courseTitle: null,
    ...patch,
  };
}

export function makeCalendarEntry(
  patch: Partial<CalendarEntry> = {},
  entity: Partial<Entity> = {},
): CalendarEntry {
  return {
    entity: makeEntity({
      id: "entry-1",
      type: "calendar_entry",
      title: "Dentist",
      key: "CAL-1",
      ...entity,
    }),
    templateId: null,
    date: "2026-03-10",
    endDate: null,
    startTime: "09:00",
    endTime: "10:00",
    allDay: false,
    cancelled: false,
    location: null,
    description: null,
    ...patch,
  };
}

export function makeExam(patch: Partial<Exam> = {}, entity: Partial<Entity> = {}): Exam {
  return {
    entity: makeEntity({ id: "exam-1", type: "exam", title: "Final", key: "EXM-1", ...entity }),
    examDate: "2026-03-11",
    weight: null,
    grade: null,
    status: "upcoming",
    room: null,
    examTime: null,
    ...patch,
  };
}
