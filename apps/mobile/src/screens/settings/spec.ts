import type { SharedSettingId } from "@nookly/shared/settings";

/// How each shared setting is edited on the phone. The table is exhaustive (it
/// `satisfies` a record of every shared setting), so a setting added to
/// `@nookly/shared/settings` fails the build here until the phone has a control for it,
/// like the desktop's rows.
export type SettingsPage = "general" | "appearance" | "calendar" | "editor" | "latex" | "backup";

export type Control =
  | { kind: "choice"; options: { value: string | number; label: string }[] }
  | { kind: "switch" }
  | { kind: "text"; placeholder?: string; multiline?: boolean; allowEmpty?: boolean }
  | { kind: "stepper"; min: number; max: number; step: number; unit?: string };

export const PAGES: { id: SettingsPage; title: string; subtitle: string }[] = [
  { id: "general", title: "General", subtitle: "Your name, time zone and formats" },
  { id: "appearance", title: "Appearance", subtitle: "Theme and file viewer" },
  { id: "calendar", title: "Calendar", subtitle: "Week, day and new entries" },
  { id: "editor", title: "Editor", subtitle: "Pages and code" },
  { id: "latex", title: "LaTeX", subtitle: "Your own math commands" },
  { id: "backup", title: "Backup", subtitle: "A copy of everything on this phone" },
];

const FORMAT = [
  { value: "american", label: "American" },
  { value: "european", label: "European" },
  { value: "timezone", label: "Time zone's own" },
];

export const SETTING_UI = {
  "general.displayName": {
    section: "Profile",
    page: "general",
    control: { kind: "text", placeholder: "Your name", allowEmpty: true },
  },
  "general.timezone": {
    section: "Date and time",
    page: "general",
    control: { kind: "text", placeholder: "system or Europe/Berlin" },
  },
  "general.dateFormat": {
    section: "Date and time",
    page: "general",
    control: { kind: "choice", options: FORMAT },
  },
  "general.timeFormat": {
    section: "Date and time",
    page: "general",
    control: { kind: "choice", options: FORMAT },
  },
  "general.effortScale": {
    section: "Tasks",
    page: "general",
    control: {
      kind: "choice",
      options: [
        { value: "tshirt", label: "T-shirt sizes" },
        { value: "fibonacci", label: "Points" },
      ],
    },
  },
  "appearance.theme": {
    page: "appearance",
    control: {
      kind: "choice",
      options: [
        { value: "system", label: "System" },
        { value: "light", label: "Light" },
        { value: "dark", label: "Dark" },
      ],
    },
  },
  "appearance.fileViewerTheme": {
    page: "appearance",
    control: {
      kind: "choice",
      options: [
        { value: "defaults", label: "Defaults" },
        { value: "light", label: "Light" },
        { value: "dark", label: "Dark" },
      ],
    },
  },
  "calendar.sessionLengthMinutes": {
    section: "Defaults",
    page: "calendar",
    control: { kind: "stepper", min: 5, max: 720, step: 5, unit: "min" },
  },
  "calendar.calendarEntryLengthMinutes": {
    section: "Defaults",
    page: "calendar",
    control: { kind: "stepper", min: 5, max: 720, step: 5, unit: "min" },
  },
  "calendar.weekStart": {
    section: "Week and day",
    page: "calendar",
    control: {
      kind: "choice",
      options: [
        { value: "auto", label: "Automatic" },
        { value: "monday", label: "Monday" },
        { value: "sunday", label: "Sunday" },
        { value: "saturday", label: "Saturday" },
      ],
    },
  },
  "calendar.dayStartHour": {
    section: "Week and day",
    page: "calendar",
    control: { kind: "stepper", min: 0, max: 23, step: 1, unit: "h" },
  },
  "calendar.todayColor": {
    section: "Current day",
    page: "calendar",
    control: {
      kind: "choice",
      options: [
        { value: "primary", label: "Primary" },
        { value: "neutral", label: "Neutral" },
      ],
    },
  },
  "calendar.todayIntensity": {
    section: "Current day",
    page: "calendar",
    control: {
      kind: "choice",
      options: [
        { value: "low", label: "Low" },
        { value: "default", label: "Default" },
        { value: "high", label: "High" },
      ],
    },
  },
  "calendar.snapMinutes": {
    section: "Week and day",
    page: "calendar",
    control: {
      kind: "choice",
      options: [5, 10, 15, 30].map((value) => ({ value, label: `${value} min` })),
    },
  },
  "notes.defaultCodeLanguage": {
    section: "Code",
    page: "editor",
    control: { kind: "text", placeholder: "plaintext" },
  },
  "notes.formatCodeOnPaste": { section: "Code", page: "editor", control: { kind: "switch" } },
  "notes.arrowLigatures": { section: "Editing", page: "editor", control: { kind: "switch" } },
  "notes.latexMacros": {
    page: "latex",
    control: { kind: "text", multiline: true, allowEmpty: true },
  },
} as const satisfies Record<
  SharedSettingId,
  { page: SettingsPage; section?: string; control: Control }
>;

// SAFETY: the keys of `SETTING_UI` are exactly `SharedSettingId`, by its `satisfies` above.
const ids = Object.keys(SETTING_UI) as SharedSettingId[];

export const SETTING_IDS: SharedSettingId[] = ids;

/// The small heading a setting sits under in its category, if it has one.
export function sectionOf(id: SharedSettingId): string | undefined {
  const ui = SETTING_UI[id];
  return "section" in ui ? ui.section : undefined;
}
