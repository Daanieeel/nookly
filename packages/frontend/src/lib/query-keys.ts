/// Every React Query key in the app. Keys nest from broad to narrow, so invalidating a
/// `root` (or any shorter key) also refreshes everything built on it, e.g.
/// `qk.entities.bySpace(id)` is a prefix of `qk.entities.noteSummaries(id)`.
/// Never write a `queryKey` literal outside this file (`bun run lint:keys`).

/// `root` plus a per Space list, the shape most modules share.
function spaceList<const Name extends string>(name: Name) {
  return {
    root: [name] as const,
    bySpace: (spaceId: string) => [name, spaceId] as const,
  };
}

export const qk = {
  spaces: ["spaces"] as const,
  spaceModules: (spaceId: string) => ["space-modules", spaceId] as const,

  entities: {
    root: ["entities"] as const,
    all: ["entities", "all"] as const,
    trash: ["entities", "all", "trash"] as const,
    bySpace: (spaceId: string) => ["entities", spaceId] as const,
    noteSummaries: (spaceId: string) => ["entities", spaceId, "note-summaries"] as const,
    jotSummaries: (spaceId: string) => ["entities", spaceId, "jot-summaries"] as const,
  },
  entity: {
    root: ["entity"] as const,
    byId: (entityId: string | undefined) => ["entity", entityId] as const,
  },

  relationships: {
    of: (entityId: string | undefined) => ["relationships", entityId] as const,
    types: ["relationship-types"] as const,
  },
  labels: {
    ...spaceList("labels"),
    forSpaces: (spaceIds: string[]) => ["labels", "all", spaceIds] as const,
    ofEntityRoot: ["entity-labels"] as const,
    ofEntity: (entityId: string) => ["entity-labels", entityId] as const,
    idsForSpaces: (spaceIds: string[]) => ["entity-label-ids", "all", spaceIds] as const,
  },
  blocks: (entityId: string) => ["blocks", entityId] as const,
  pageMarkdown: (entityId: string) => ["page-markdown", entityId] as const,
  mentioning: (entityId: string) => ["mentioning-entities", entityId] as const,
  embeddedPageIds: ["embedded-page-ids"] as const,
  search: (query: string) => ["search", query] as const,
  highlight: (language: string | null, text: string) => ["highlight", language, text] as const,

  tasks: {
    ...spaceList("tasks"),
    all: ["tasks", "all"] as const,
    byIdRoot: ["task"] as const,
    byId: (id: string) => ["task", id] as const,
    statuses: ["task-statuses"] as const,
    parentOf: (entityId: string | undefined) => ["task-parent", entityId] as const,
    subtasksRoot: ["subtasks"] as const,
    subtasks: (parentId: string | undefined) => ["subtasks", parentId] as const,
    subtaskProgressRoot: ["subtask-progress"] as const,
    subtaskProgress: (entityId: string) => ["subtask-progress", entityId] as const,
    dueToday: ["tasks-due-today"] as const,
    openDueOrOverdue: ["open-tasks-due-or-overdue"] as const,
    openDueOrOverdueList: ["open-tasks-due-or-overdue", "list"] as const,
  },

  sessions: {
    ...spaceList("sessions"),
    all: ["sessions", "all"] as const,
    today: ["sessions-today"] as const,
    todayBetween: (from: string, to: string) => ["sessions-today", "between", from, to] as const,
    pages: (entityId: string) => ["session-pages", entityId] as const,
  },
  calendarEntries: {
    ...spaceList("calendar-entries"),
    all: ["calendar-entries", "all"] as const,
  },
  externalCalendars: {
    status: ["external-calendars", "status"] as const,
    events: ["external-calendars", "events"] as const,
    eventsBetween: (from: string, to: string) =>
      ["external-calendars", "events", from, to] as const,
  },

  assignments: {
    ...spaceList("assignments"),
    all: ["assignments-all"] as const,
  },
  courses: {
    ...spaceList("courses"),
    details: (courseId: string) => ["course-details", courseId] as const,
    notes: (courseId: string) => ["course-notes", courseId] as const,
    grades: (courseId: string, examsAt: number, assignmentsAt: number, relationshipsAt: number) =>
      ["course-grades", courseId, examsAt, assignmentsAt, relationshipsAt] as const,
  },
  semesters: {
    ...spaceList("semesters"),
    notes: (semesterId: string) => ["semester-notes", semesterId] as const,
  },
  gradeReport: spaceList("grade-report"),
  exams: {
    ...spaceList("exams"),
    all: ["exams-all"] as const,
  },
  studyBlocks: spaceList("study-blocks"),
  decks: {
    ...spaceList("decks"),
    summaries: ["deck-summaries"] as const,
    summariesBySpace: (spaceId: string) => ["deck-summaries", spaceId] as const,
    cards: (deckId: string) => ["cards", deckId] as const,
    queue: (deckId: string) => ["study-queue", deckId] as const,
    stats: (deckId: string) => ["deck-stats", deckId] as const,
  },

  jots: {
    unrefined: ["unrefined-jots"] as const,
    unrefinedAll: ["unrefined-jots", "all"] as const,
    unrefinedList: (limit: number) => ["unrefined-jots", "all", "list", limit] as const,
  },

  bookmarks: {
    ...spaceList("bookmarks"),
    byId: (id: string | null) => ["bookmark", id] as const,
  },
  files: {
    ...spaceList("files"),
    byId: (id: string | undefined) => ["file", id] as const,
    text: (id: string) => ["file-text", id] as const,
    workbook: (id: string, src: string) => ["workbook", id, src] as const,
    openWithApps: (id: string, path: string | null) => ["open-with-apps", id, path] as const,
    officePdf: ["office-pdf"] as const,
    officePdfOf: (id: string, path: string | null) => ["office-pdf", id, path] as const,
    officeThumbnailOf: (id: string, path: string | null) => ["office-thumbnail", id, path] as const,
    officeConverter: ["office-converter"] as const,
    libreofficeInstallOptions: ["libreoffice-install-options"] as const,
  },
  views: {
    ...spaceList("views"),
    byId: (id: string | undefined) => ["view", id] as const,
    byModule: (spaceId: string, module: string | null) => ["views", spaceId, module] as const,
  },
  recipes: {
    ...spaceList("recipes"),
    byId: (id: string) => ["recipe", id] as const,
    steps: (recipeId: string) => ["recipe-steps", recipeId] as const,
    ingredients: (recipeId: string) => ["recipe-ingredients", recipeId] as const,
    tags: ["recipe-tags"] as const,
  },

  backups: {
    root: ["backups"] as const,
    inFolder: (folder: string | null) => ["backups", folder] as const,
  },
  appVersion: ["app-version"] as const,
  appUpdate: ["app-update"] as const,
  cliInstallStatus: ["cli-install-status"] as const,
};
