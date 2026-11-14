import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { createContext, type ReactNode, useContext } from "react";
import { Linking } from "react-native";
import { type Http, type MoodleApi, moodleApi } from "./api.ts";
import { type KeyStore, type MoodleAccount, moodleAccount } from "./connection.ts";

/// Everything Moodle on the phone reaches outside itself: the network, the keychain and the
/// browser. The app uses the real ones; a test hands in faithful stand ins.
export interface MoodleService {
  api: MoodleApi;
  account: MoodleAccount;
  /// Opens a page on the site, or the sign in page, in the browser.
  open: (url: string) => Promise<void>;
}

export function moodleService({
  http,
  keys,
  md5,
  uuid,
  open,
  now,
}: {
  http: Http;
  keys: KeyStore;
  md5: (text: string) => Promise<string>;
  uuid: () => string;
  open: (url: string) => Promise<void>;
  now?: () => number;
}): MoodleService {
  const api = moodleApi(http);
  return { api, account: moodleAccount({ keys, api, md5, uuid, now }), open };
}

const device = moodleService({
  http: (url, init) => fetch(url, init),
  keys: SecureStore,
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
