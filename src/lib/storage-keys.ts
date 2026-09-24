/// Every `localStorage` key the app uses; documented in docs/development/local-storage-key.md.
export const STORAGE_KEYS = {
  sidebarCollapsed: "nookly:sidebar-collapsed",
  rightSidebarCollapsed: "nookly:right-sidebar-collapsed",
  rightSidebarWidth: "nookly:right-sidebar-width",
  activeSpace: "nookly:active-space",
  recents: "nookly:recents",
  cliInstallCardDismissed: "nookly:cli-install-card-dismissed",
  theme: "nookly:theme",
  notesSort: "nookly:notes-sort",
  jotsSort: "nookly:jots-sort",
  tasksDisplay: "nookly:tasks-display",
  assignmentsGrouping: "nookly:assignments-grouping",
  timezone: "nookly:timezone",
  dateFormat: "nookly:date-format",
  timeFormat: "nookly:time-format",
} as const;
