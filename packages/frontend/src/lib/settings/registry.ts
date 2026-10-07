import { z } from "zod";

/// Every hard setting Nookly has. Each one has a unique dotted id
/// (`category.name`), is stored under that id in `settings.json`, and says how
/// to validate whatever was read from disk. See docs/development/settings.md.

export type SettingCategory = "general" | "appearance" | "calendar" | "notes" | "shortcuts";

export const SETTING_CATEGORIES: SettingCategory[] = [
  "general",
  "appearance",
  "calendar",
  "notes",
  "shortcuts",
];

/// Any value `settings.json` can hold.
export type SettingJson =
  | string
  | number
  | boolean
  | null
  | SettingJson[]
  | { [key: string]: SettingJson };

export interface SettingDef<T extends SettingJson> {
  /// Unique, `<category>.<name>`, never renamed once released.
  id: string;
  category: SettingCategory;
  title: string;
  description: string;
  /// Other words someone might search for.
  synonyms: string[];
  default: T;
  /// Turns anything read from disk into a valid value, falling back to the default.
  parse: (raw: SettingJson) => T;
  /// The `preferences.json` key this setting used to live under. Its value is
  /// copied over once, then the old key is deleted.
  legacyKey?: string;
  /// Turns the old string value into a candidate for `parse`; the string itself
  /// when missing.
  fromLegacy?: (raw: string) => SettingJson;
}

type SettingInput<T extends SettingJson> = Omit<SettingDef<T>, "parse"> & {
  /// What a valid value looks like. Anything else becomes `default`.
  schema: z.ZodType<T>;
};

function define<T extends SettingJson>({ schema, ...def }: SettingInput<T>): SettingDef<T> {
  const lenient = schema.catch(def.default);
  return { ...def, parse: (raw) => lenient.parse(raw) };
}

const FORMAT_MODES = z.enum(["american", "european", "timezone"]);
const THEMES = z.enum(["light", "dark", "system"]);
const FILE_VIEWER_THEMES = z.enum(["light", "dark", "defaults"]);
const text = z.string().min(1);
/// A length in whole steps of five minutes, from 5 minutes to 12 hours.
const minutes = z.number().int().min(5).max(720).multipleOf(5);

/// The file viewer's theme choice, with the defaults when there is none. "system",
/// the old "follow the app theme" choice, became the defaults.
export function parseFileViewerTheme(stored: SettingJson): z.infer<typeof FILE_VIEWER_THEMES> {
  return FILE_VIEWER_THEMES.catch("defaults").parse(stored);
}

export const SETTINGS = {
  "appearance.theme": define({
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
    legacyKey: "nookly:theme",
  }),
  "appearance.fileViewerTheme": define({
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
    legacyKey: "nookly:file-viewer-theme",
  }),
  "general.timezone": define({
    id: "general.timezone",
    category: "general",
    title: "Time zone",
    description: "The zone times are shown in. System follows your computer.",
    synonyms: ["time zone", "tz", "clock", "region", "utc", "gmt", "country", "local time"],
    default: "system",
    schema: text,
    legacyKey: "nookly:timezone",
  }),
  "general.dateFormat": define({
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
    legacyKey: "nookly:date-format",
  }),
  "general.timeFormat": define({
    id: "general.timeFormat",
    category: "general",
    title: "Time format",
    description: "American (12 hour), European (24 hour), or the time zone's own.",
    synonyms: ["clock", "12 hour", "24 hour", "am pm", "military time", "american", "european"],
    default: "timezone",
    schema: FORMAT_MODES,
    legacyKey: "nookly:time-format",
  }),
  "general.effortScale": define({
    id: "general.effortScale",
    category: "general",
    title: "Effort scale",
    description: "Show task effort as T-shirt sizes or points. Stored estimates never change.",
    synonyms: ["estimate", "t-shirt", "story points", "points", "fibonacci", "size", "tasks"],
    default: "tshirt",
    schema: z.enum(["tshirt", "fibonacci"]),
    legacyKey: "nookly:effort-scale",
  }),
  "general.backupFolder": define<string | null>({
    id: "general.backupFolder",
    category: "general",
    title: "Backup folder",
    description: "The folder backups are written to.",
    synonyms: [
      "backup location",
      "export",
      "copy",
      "save",
      "icloud",
      "google drive",
      "dropbox",
      "archive",
      "restore",
    ],
    default: null,
    schema: text.nullable(),
    legacyKey: "nookly:backup-folder",
  }),
  "general.backupAuto": define({
    id: "general.backupAuto",
    category: "general",
    title: "Back up every day",
    description: "Back up automatically once a day while Nookly is open.",
    synonyms: [
      "automatic backup",
      "scheduled backup",
      "daily backup",
      "export",
      "copy",
      "save",
      "archive",
    ],
    default: false,
    schema: z.boolean(),
    legacyKey: "nookly:backup-auto",
    fromLegacy: (raw) => raw === "1",
  }),
  "notes.defaultCodeLanguage": define({
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
    legacyKey: "nookly:code-language",
  }),
  "calendar.sessionLengthMinutes": define({
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
  }),
  "calendar.calendarEntryLengthMinutes": define({
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
  }),
  "calendar.weekStart": define({
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
  }),
  "calendar.dayStartHour": define({
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
  }),
  "calendar.snapMinutes": define({
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
  }),
  "notes.arrowLigatures": define({
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
  }),
};

export type SettingId = keyof typeof SETTINGS;
export type SettingValue<I extends SettingId> = ReturnType<(typeof SETTINGS)[I]["parse"]>;

/// A setting's definition, typed loosely for code that walks every setting.
export function definitionOf(id: SettingId): SettingDef<SettingJson> {
  return SETTINGS[id];
}

export function isSettingId(id: string): id is SettingId {
  return Object.hasOwn(SETTINGS, id);
}

export const SETTING_IDS: SettingId[] = Object.keys(SETTINGS).filter(isSettingId);
