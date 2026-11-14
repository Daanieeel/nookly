import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from "expo-crypto";
import { File } from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import { createContext, type ReactNode, useContext } from "react";
import { Linking } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { storePicked } from "../data/files.ts";
import { type AnswerCache, type Http, type MoodleApi, moodleApi } from "./api.ts";
import { type KeyStore, type MoodleAccount, moodleAccount } from "./connection.ts";
import { type CalendarStore, type MoodleCalendar, moodleCalendar } from "./calendar.ts";
import {
  deviceAnswers,
  deviceCalendarStore,
  deviceDownloads,
  type MoodleDownloads,
} from "./device.ts";

/// Everything Moodle on the phone reaches outside itself: the network, the keychain, the
/// phone's folders and the browser. The app uses the real ones; a test hands in faithful
/// stand ins.
export interface MoodleService {
  api: MoodleApi;
  account: MoodleAccount;
  /// Files from the site, downloaded once into the phone's own folder and kept there.
  downloads: MoodleDownloads;
  /// Copies a downloaded file into Nookly's own folder, for importing it as a File.
  store: (uri: string) => Promise<{ name: string; uri: string }>;
  /// Signs out: forgets the site, the sign in and the kept answers. Downloaded files stay.
  signOut: () => Promise<void>;
  /// Moodle's deadlines on the calendar, from the site's calendar export link.
  calendar: MoodleCalendar;
  /// Opens a page on the site in the browser.
  open: (url: string) => Promise<void>;
  /// Opens the site's sign in page in the system's sign in sheet (which offers saved
  /// passwords) and gives back the `nookly://` link Moodle sends at the end, or null when
  /// the person closed it.
  signIn: (url: string) => Promise<string | null>;
}

export function moodleService({
  http,
  keys,
  cache,
  downloads,
  store,
  calendarStore,
  md5,
  uuid,
  open,
  signIn,
  now,
}: {
  http: Http;
  keys: KeyStore;
  cache: AnswerCache;
  downloads: MoodleDownloads;
  store: MoodleService["store"];
  calendarStore: CalendarStore;
  md5: (text: string) => Promise<string>;
  uuid: () => string;
  open: (url: string) => Promise<void>;
  signIn: MoodleService["signIn"];
  now?: () => number;
}): MoodleService {
  const api = moodleApi(http, cache);
  const account = moodleAccount({ keys, api, md5, uuid, now });
  return {
    api,
    account,
    downloads,
    store,
    calendar: moodleCalendar({ http, keys, store: calendarStore, now }),
    signOut: async () => {
      await account.disconnect();
      await cache.clear();
    },
    open,
    signIn,
  };
}

const device = moodleService({
  http: (url, init) => fetch(url, init),
  keys: SecureStore,
  cache: deviceAnswers,
  downloads: deviceDownloads,
  store: (uri) => storePicked(new File(uri)),
  calendarStore: deviceCalendarStore,
  md5: (text) => digestStringAsync(CryptoDigestAlgorithm.MD5, text),
  uuid: randomUUID,
  open: async (url) => {
    await Linking.openURL(url);
  },
  signIn: async (url) => {
    const result = await WebBrowser.openAuthSessionAsync(url, "nookly://");
    return result.type === "success" ? result.url : null;
  },
});

const MoodleContext = createContext<MoodleService>(device);

export function MoodleProvider({
  service,
  children,
}: {
  service: MoodleService;
  children: ReactNode;
}) {
  return <MoodleContext.Provider value={service}>{children}</MoodleContext.Provider>;
}

export const useMoodleService = () => useContext(MoodleContext);
