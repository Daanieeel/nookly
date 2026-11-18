import { Directory, File, Paths } from "expo-file-system";
import { safeName } from "../data/files.ts";
import type { AnswerCache } from "./api.ts";
import type { CalendarStore } from "./calendar.ts";

/// Where Moodle keeps things on this phone, as the desktop does (`moodle-cache/`,
/// `moodle-files/`): the last answers in the caches folder, which nothing backs up and
/// signing out empties; downloaded files in the documents folder, kept for good.

const CACHE_FOLDER = "moodle-cache";
export const FILES_FOLDER = "moodle-files";

/// A short, stable name for any text (FNV-1a), for folder and file names.
export function shortHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export const deviceAnswers: AnswerCache = {
  async get(key) {
    const file = new File(Paths.cache, CACHE_FOLDER, `${shortHash(key)}.json`);
    return file.exists ? await file.text() : null;
  },
  async set(key, body) {
    const folder = new Directory(Paths.cache, CACHE_FOLDER);
    folder.create({ intermediates: true, idempotent: true });
    const file = new File(folder, `${shortHash(key)}.json`);
    if (!file.exists) file.create();
    file.write(body);
  },
  async clear() {
    const folder = new Directory(Paths.cache, CACHE_FOLDER);
    if (folder.exists) folder.delete();
  },
};

/// Files from the site on this phone: each downloaded once (a newer version of the same file
/// again) into `moodle-files/`, under its own name.
export interface MoodleDownloads {
  /// Where the file is on this phone, or null while it has not been downloaded.
  local(url: string, name: string, timeModified: number): string | null;
  /// Downloads it from `signedUrl` (the address with the token) unless it is here already.
  fetch(url: string, signedUrl: string, name: string, timeModified: number): Promise<string>;
}

const placeOf = (url: string, name: string, timeModified: number) =>
  new File(
    Paths.document,
    FILES_FOLDER,
    shortHash(`${url.split(/[?#]/)[0]}|${timeModified}`),
    safeName(name),
  );

export const deviceDownloads: MoodleDownloads = {
  local(url, name, timeModified) {
    const file = placeOf(url, name, timeModified);
    return file.exists ? file.uri : null;
  },
  async fetch(url, signedUrl, name, timeModified) {
    const file = placeOf(url, name, timeModified);
    if (file.exists) return file.uri;
    const folder = file.parentDirectory;
    folder.create({ intermediates: true, idempotent: true });
    const downloaded = await File.downloadFileAsync(signedUrl, file);
    return downloaded.uri;
  },
};

/// The calendar's events, kept in the documents folder (the desktop's
/// `external-calendars.json`) so the calendar shows them offline. The link stays in the
/// keychain.
const calendarFile = () => new File(Paths.document, "moodle-calendar.json");

export const deviceCalendarStore: CalendarStore = {
  async read() {
    const file = calendarFile();
    return file.exists ? await file.text() : null;
  },
  async write(body) {
    const file = calendarFile();
    if (!file.exists) file.create();
    file.write(body);
  },
  async clear() {
    const file = calendarFile();
    if (file.exists) file.delete();
  },
};
