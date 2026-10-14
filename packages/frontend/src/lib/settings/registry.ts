import { SHARED_SETTINGS, type SettingCategory, type SettingJson } from "@nookly/shared/settings";
import { z } from "zod";
import { BACKUP_KEEP } from "#/lib/api/backup.ts";
import { HOTKEYS } from "#/lib/hotkeys.ts";
import {
  SHORTCUT_META,
  SHORTCUT_NAMES,
  type ShortcutName,
  checkBinding,
  shortcutSettingId,
} from "#/lib/shortcuts.ts";

/// Every hard setting Nookly has. Each one has a unique dotted id
/// (`category.name`), is stored under that id in `settings.json`, and says how
/// to validate whatever was read from disk. See docs/development/settings.md.

export type { SettingCategory, SettingJson };

export const SETTING_CATEGORIES: SettingCategory[] = [
  "general",
  "appearance",
  "calendar",
  "notes",
  "backup",
  "agent",
  "sync",
  "shortcuts",
];

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
  /// Ids this setting was stored under before a rename. A value found under one is
  /// copied to `id`, verified on disk, and only then deleted. A value already under
  /// `id` wins.
  previousIds?: string[];
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

const FILE_VIEWER_THEMES = z.enum(["light", "dark", "defaults"]);
const text = z.string().min(1);

/// The file viewer's theme choice, with the defaults when there is none. "system",
/// the old "follow the app theme" choice, became the defaults.
export function parseFileViewerTheme(stored: SettingJson): z.infer<typeof FILE_VIEWER_THEMES> {
  return FILE_VIEWER_THEMES.catch("defaults").parse(stored);
}

/// A shortcut's stored key: a hotkey it may have, or null for "unassigned", which is
/// not the same as absent (the default). Only an override is ever stored.
function shortcutSchema(name: ShortcutName) {
  return z
    .string()
    .refine((hotkey) => checkBinding(name, hotkey).ok)
    .nullable();
}

type ShortcutSettings = {
  [N in ShortcutName as `shortcuts.${N}`]: SettingDef<string | null>;
};

// SAFETY: one entry per shortcut name, keyed `shortcuts.<name>`, which is exactly the
// mapped type above.
const SHORTCUT_SETTINGS = Object.fromEntries(
  SHORTCUT_NAMES.map((name) => {
    const id = shortcutSettingId(name);
    const meta = SHORTCUT_META[name];
    return [
      id,
      define<string | null>({
        id,
        category: "shortcuts",
        title: meta.title,
        description: meta.description,
        synonyms: ["shortcut", "keyboard", "hotkey", "key binding", ...meta.synonyms],
        default: HOTKEYS[name],
        schema: shortcutSchema(name),
      }),
    ];
  }),
) as ShortcutSettings;

export const SETTINGS = {
  ...SHORTCUT_SETTINGS,
  "appearance.theme": define({
    ...SHARED_SETTINGS["appearance.theme"],
    legacyKey: "nookly:theme",
  }),
  "appearance.fileViewerTheme": define({
    ...SHARED_SETTINGS["appearance.fileViewerTheme"],
    legacyKey: "nookly:file-viewer-theme",
  }),
  "general.displayName": define(SHARED_SETTINGS["general.displayName"]),
  "sync.serverUrl": define({
    id: "sync.serverUrl",
    category: "sync",
    title: "Server",
    description:
      "The sync server this device signs in to, like https://sync.example.com. Sync is optional; without it everything stays on this device.",
    synonyms: ["sync", "server", "url", "address", "cloud", "backend", "self hosted"],
    default: "",
    schema: z.union([z.literal(""), z.url().max(300)]),
  }),
  "general.timezone": define({
    ...SHARED_SETTINGS["general.timezone"],
    legacyKey: "nookly:timezone",
  }),
  "general.dateFormat": define({
    ...SHARED_SETTINGS["general.dateFormat"],
    legacyKey: "nookly:date-format",
  }),
  "general.timeFormat": define({
    ...SHARED_SETTINGS["general.timeFormat"],
    legacyKey: "nookly:time-format",
  }),
  "general.effortScale": define({
    ...SHARED_SETTINGS["general.effortScale"],
    legacyKey: "nookly:effort-scale",
  }),
  "backup.folder": define<string | null>({
    id: "backup.folder",
    category: "backup",
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
    previousIds: ["general.backupFolder"],
  }),
  "backup.auto": define({
    id: "backup.auto",
    category: "backup",
    title: "Back up every day",
    description: `Back up automatically once a day while Nookly is open. Keeps the newest ${BACKUP_KEEP} backups.`,
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
    previousIds: ["general.backupAuto"],
    fromLegacy: (raw) => raw === "1",
  }),
  "notes.defaultCodeLanguage": define({
    ...SHARED_SETTINGS["notes.defaultCodeLanguage"],
    legacyKey: "nookly:code-language",
  }),
  "calendar.sessionLengthMinutes": define(SHARED_SETTINGS["calendar.sessionLengthMinutes"]),
  "calendar.calendarEntryLengthMinutes": define(
    SHARED_SETTINGS["calendar.calendarEntryLengthMinutes"],
  ),
  "calendar.weekStart": define(SHARED_SETTINGS["calendar.weekStart"]),
  "calendar.dayStartHour": define(SHARED_SETTINGS["calendar.dayStartHour"]),
  "calendar.todayColor": define(SHARED_SETTINGS["calendar.todayColor"]),
  "calendar.todayIntensity": define(SHARED_SETTINGS["calendar.todayIntensity"]),
  "calendar.snapMinutes": define(SHARED_SETTINGS["calendar.snapMinutes"]),
  "notes.formatCodeOnPaste": define(SHARED_SETTINGS["notes.formatCodeOnPaste"]),
  "notes.latexMacros": define(SHARED_SETTINGS["notes.latexMacros"]),
  "notes.vimMode": define({
    id: "notes.vimMode",
    category: "notes",
    title: "Vim keys in pages",
    description:
      "Edit pages with Vim's modes and keys: normal, insert and visual mode, motions like w and $, operators like d, c and y with text objects, counts, u to undo. Press ? in normal mode for the list. Off, the editor behaves as usual.",
    synonyms: [
      "vim",
      "neovim",
      "modal",
      "keybindings",
      "normal mode",
      "insert mode",
      "hjkl",
      "notes",
    ],
    default: false,
    schema: z.boolean(),
  }),
  "notes.arrowLigatures": define(SHARED_SETTINGS["notes.arrowLigatures"]),
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
