import { z } from "zod";
import { DEFAULT_LATEX_MACROS, serializeLatexMacros } from "./latex.ts";

/// A value `settings.json` (the desktop) or the phone's store can hold.
export type SettingJson =
  | string
  | number
  | boolean
  | null
  | SettingJson[]
  | { [key: string]: SettingJson };

export type SettingCategory =
  | "general"
  | "appearance"
  | "calendar"
  | "notes"
  | "backup"
  | "agent"
  | "sync"
  | "shortcuts";

/// What a setting is, for every client: the same id, words, default and check on the
/// desktop and the phone. How a client stores or edits it is its own business. The
/// settings that follow the account are listed in `sync/settings.ts`.
export interface SharedSetting<T extends SettingJson> {
  /// Unique, `<category>.<name>`, never renamed once released.
  id: string;
  category: SettingCategory;
  title: string;
  description: string;
  /// Other words someone might search for.
  synonyms: string[];
  default: T;
  /// What a valid value looks like. Anything else becomes `default`.
  schema: z.ZodType<T>;
}

const FORMAT_MODES = z.enum(["american", "european", "timezone"]);
const THEMES = z.enum(["light", "dark", "system"]);
const FILE_VIEWER_THEMES = z.enum(["light", "dark", "defaults"]);
const text = z.string().min(1);
/// A length in whole steps of five minutes, from 5 minutes to 12 hours.
const minutes = z.number().int().min(5).max(720).multipleOf(5);

export const SHARED_SETTINGS = {
  "appearance.theme": {
    id: "appearance.theme",
    category: "appearance",
    title: "Theme",
    description: "Light, dark, or follow the system.",
    synonyms: [
      "dark mode",
      "light mode",
      "night mode",
      "colors",
      "color scheme",
      "appearance",
      "system",
    ],
    default: "system",
    schema: THEMES,
  },
  "appearance.fileViewerTheme": {
    id: "appearance.fileViewerTheme",
    category: "appearance",
    title: "File viewer theme",
    description: "How files are drawn in the viewer. Defaults draws code dark and documents light.",
    synonyms: [
      "file preview",
      "code theme",
      "dark mode",
      "light mode",
      "colors",
      "viewer",
      "document",
      "appearance",
    ],
    default: "defaults",
    schema: FILE_VIEWER_THEMES,
  },
  "general.displayName": {
    id: "general.displayName",
    category: "general",
    title: "Your name",
    description:
      "What the Dashboard greeting calls you. Leave it empty to be greeted without a name.",
    synonyms: ["name", "nickname", "greeting", "profile", "username", "call me", "first name"],
    default: "",
    schema: z.string().max(40),
  },
  "general.timezone": {
    id: "general.timezone",
    category: "general",
    title: "Time zone",
    description: "The zone times are shown in. System follows your computer.",
    synonyms: ["time zone", "tz", "clock", "region", "utc", "gmt", "country", "local time"],
    default: "system",
    schema: text,
  },
  "general.dateFormat": {
    id: "general.dateFormat",
    category: "general",
    title: "Date format",
    description: "American (month first), European (day first), or the time zone's own.",
    synonyms: [
      "date style",
      "locale",
      "region",
      "day month year",
      "mdy",
      "dmy",
      "american",
      "european",
    ],
    default: "timezone",
    schema: FORMAT_MODES,
  },
  "general.timeFormat": {
    id: "general.timeFormat",
    category: "general",
    title: "Time format",
    description: "American (12 hour), European (24 hour), or the time zone's own.",
    synonyms: ["clock", "12 hour", "24 hour", "am pm", "military time", "american", "european"],
    default: "timezone",
    schema: FORMAT_MODES,
  },
  "general.effortScale": {
    id: "general.effortScale",
    category: "general",
    title: "Effort scale",
    description: "Show task effort as T-shirt sizes or points. Stored estimates never change.",
    synonyms: ["estimate", "t-shirt", "story points", "points", "fibonacci", "size", "tasks"],
    default: "tshirt",
    schema: z.enum(["tshirt", "fibonacci"]),
  },
  "notes.defaultCodeLanguage": {
    id: "notes.defaultCodeLanguage",
    category: "notes",
    title: "Default code language",
    description:
      "The language a new code block starts with, used for syntax highlighting. A note can pick its own.",
    synonyms: [
      "programming language",
      "syntax",
      "syntax highlighting",
      "highlight",
      "code block",
      "snippet",
      "programming",
      "plain text",
      "notes",
    ],
    default: "plaintext",
    schema: text,
  },
  "calendar.sessionLengthMinutes": {
    id: "calendar.sessionLengthMinutes",
    category: "calendar",
    title: "Session length",
    description:
      "How long a new session is when you click an empty slot or press New. Dragging on the calendar still sets its own length. In minutes, 5 to 720.",
    synonyms: [
      "duration",
      "study block",
      "lesson length",
      "minutes",
      "time",
      "default length",
      "calendar",
    ],
    default: 90,
    schema: minutes,
  },
  "calendar.calendarEntryLengthMinutes": {
    id: "calendar.calendarEntryLengthMinutes",
    category: "calendar",
    title: "Calendar entry length",
    description:
      "How long a new calendar entry is when you click an empty slot or press New. Dragging on the calendar still sets its own length. In minutes, 5 to 720.",
    synonyms: [
      "duration",
      "event length",
      "appointment",
      "meeting",
      "minutes",
      "time",
      "default length",
      "calendar",
    ],
    default: 60,
    schema: minutes,
  },
  "calendar.weekStart": {
    id: "calendar.weekStart",
    category: "calendar",
    title: "First day of the week",
    description:
      "Where weeks begin in calendars, date pickers and week groupings. Automatic follows the date format: American starts on Sunday, the rest on Monday.",
    synonyms: [
      "week start",
      "monday",
      "sunday",
      "saturday",
      "weekday",
      "start of week",
      "weeks begin",
      "calendar",
    ],
    default: "auto",
    schema: z.enum(["auto", "monday", "sunday", "saturday"]),
  },
  "calendar.dayStartHour": {
    id: "calendar.dayStartHour",
    category: "calendar",
    title: "Day starts at",
    description:
      "The hour the day and week views scroll to when they open. The whole day stays available. 0 to 23.",
    synonyms: [
      "scroll",
      "first hour",
      "morning",
      "working hours",
      "start of day",
      "hour",
      "time grid",
      "calendar",
    ],
    default: 7,
    schema: z.number().int().min(0).max(23),
  },
  "calendar.todayColor": {
    id: "calendar.todayColor",
    category: "calendar",
    title: "Current day colour",
    description:
      "The colour that marks today in the week, day and month views. Primary is the app's blue, Neutral a quiet grey.",
    synonyms: ["today", "current day", "highlight", "colour", "color", "grey", "gray", "calendar"],
    default: "primary",
    schema: z.enum(["primary", "neutral"]),
  },
  "calendar.todayIntensity": {
    id: "calendar.todayIntensity",
    category: "calendar",
    title: "Current day intensity",
    description: "How strongly today's column is tinted in the week and day views.",
    synonyms: [
      "today",
      "current day",
      "contrast",
      "highlight",
      "strength",
      "brightness",
      "calendar",
    ],
    default: "default",
    schema: z.enum(["low", "default", "high"]),
  },
  "calendar.snapMinutes": {
    id: "calendar.snapMinutes",
    category: "calendar",
    title: "Snap to",
    description:
      "How finely dragging snaps on the calendar when you create, move or resize something.",
    synonyms: [
      "grid",
      "drag",
      "precision",
      "round",
      "increment",
      "interval",
      "minutes",
      "resize",
      "calendar",
    ],
    default: 15,
    schema: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(30)]),
  },
  "notes.formatCodeOnPaste": {
    id: "notes.formatCodeOnPaste",
    category: "notes",
    title: "Format code when pasted",
    description:
      "Tidies the code in a code block right after you paste into it, for the languages that have a formatter. Undo reverts it.",
    synonyms: ["format", "prettier", "indent", "tidy", "paste", "code block", "beautify", "notes"],
    default: false,
    schema: z.boolean(),
  },
  "notes.latexMacros": {
    id: "notes.latexMacros",
    category: "notes",
    title: "LaTeX macros",
    description:
      "Your own LaTeX commands, for every math block and inline formula in every Space. It starts with a few common ones, like \\abs and \\norm.",
    synonyms: [
      "latex",
      "katex",
      "math",
      "newcommand",
      "macro",
      "command",
      "notation",
      "formula",
      "equation",
      "custom",
      "notes",
    ],
    default: serializeLatexMacros(DEFAULT_LATEX_MACROS),
    schema: z.string().max(20_000),
  },
  "notes.arrowLigatures": {
    id: "notes.arrowLigatures",
    category: "notes",
    title: "Turn arrows into symbols",
    description:
      "Typing -> gives →, <= gives ≤, != gives ≠ and so on, outside code. Turn off to keep exactly what you type.",
    synonyms: [
      "arrows",
      "ligatures",
      "autocorrect",
      "symbols",
      "replace",
      "typography",
      "comparison",
      "notes",
    ],
    default: true,
    schema: z.boolean(),
  },
} as const satisfies Record<string, SharedSetting<SettingJson>>;

export type SharedSettingId = keyof typeof SHARED_SETTINGS;
