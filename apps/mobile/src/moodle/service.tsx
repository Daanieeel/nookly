import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from "expo-crypto";
import { File } from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import { createContext, type ReactNode, useContext } from "react";
import { Linking } from "react-native";
import { storePicked } from "../data/files.ts";
import { type AnswerCache, type Http, type MoodleApi, moodleApi } from "./api.ts";
import { type KeyStore, type MoodleAccount, moodleAccount } from "./connection.ts";
import { deviceAnswers, deviceDownloads, type MoodleDownloads } from "./device.ts";

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
  /// Opens a page on the site in the browser.
  open: (url: string) => Promise<void>;
}

export function moodleService({
  http,
  keys,
  cache,
  downloads,
  store,
  md5,
  uuid,
  open,
  now,
}: {
  http: Http;
  keys: KeyStore;
  cache: AnswerCache;
  downloads: MoodleDownloads;
  store: MoodleService["store"];
  md5: (text: string) => Promise<string>;
  uuid: () => string;
  open: (url: string) => Promise<void>;
  now?: () => number;
}): MoodleService {
  const api = moodleApi(http, cache);
  const account = moodleAccount({ keys, api, md5, uuid, now });
  return {
    api,
    account,
    downloads,
    store,
    signOut: async () => {
      await account.disconnect();
      await cache.clear();
    },
    open,
  };
}

const device = moodleService({
  http: (url, init) => fetch(url, init),
  keys: SecureStore,
  cache: deviceAnswers,
  downloads: deviceDownloads,
  store: (uri) => storePicked(new File(uri)),
  md5: (text) => digestStringAsync(CryptoDigestAlgorithm.MD5, text),
  uuid: randomUUID,
  open: async (url) => {
    await Linking.openURL(url);
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
