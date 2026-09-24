/// Every preference key the app stores through `preferences`; documented in
/// docs/development/preference-keys.md.
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
  jotsPreset: "nookly:jots-preset",
  tasksDisplay: "nookly:tasks-display",
  assignmentsDisplay: "nookly:assignments-display",
  filesLayout: "nookly:files-layout",
  bookmarksDisplay: "nookly:bookmarks-display",
  relatedTab: "nookly:related-tab",
  timezone: "nookly:timezone",
  dateFormat: "nookly:date-format",
  timeFormat: "nookly:time-format",
} as const;
