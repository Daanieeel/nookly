import { ApiClient, type TokenStore } from "@nookly/shared/api";
import { SHARED_SETTINGS } from "@nookly/shared/settings";
import { backUpBeforeSync } from "./backup.ts";
import type { PhoneDb } from "./database.ts";
import { phoneBlobs } from "./files.ts";
import { phoneSettings, settingsBridge } from "./settings.ts";
import { SyncRuntime } from "@nookly/shared/sync";
import { randomUUID } from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import Storage from "expo-sqlite/kv-store";
import { Platform } from "react-native";

const SESSION_TOKEN = "nookly.sync.sessionToken";
const SERVER_URL = "nookly.sync.serverUrl";

/// The account's session token, in the Keychain or Keystore; never in the database.
/// It keeps this phone signed in across restarts.
const secureTokens: TokenStore = {
  load: () => SecureStore.getItemAsync(SESSION_TOKEN),
  save: async (token) => {
    if (token) await SecureStore.setItemAsync(SESSION_TOKEN, token);
    else await SecureStore.deleteItemAsync(SESSION_TOKEN);
  },
};

/// The sync server's address, a device preference.
const THEME = "nookly.theme";

/// The theme picked in Settings, on this phone: the `appearance.theme` setting. A
/// phone that picked one before settings existed keeps it.
export const themeStore = {
  get: (): string | null => {
    const old = Storage.getItemSync(THEME);
    if (old !== null && phoneSettings.isDefault("appearance.theme")) return old;
    return phoneSettings.get("appearance.theme");
  },
  set: (theme: string) => {
    const parsed = SHARED_SETTINGS["appearance.theme"].schema.safeParse(theme);
    if (parsed.success) phoneSettings.set("appearance.theme", parsed.data);
  },
};

const ONBOARDED = "nookly.onboarded";

/// Whether the welcome screen was answered on this phone.
export const onboardedStore = {
  get: (): string | null => Storage.getItemSync(ONBOARDED),
  set: (value: string) => Storage.setItemSync(ONBOARDED, value),
};

/// Where a phone looks for the server until it is told otherwise: the one
/// `bun run stack` runs on this Mac, which the iOS simulator reaches as localhost.
export const DEFAULT_SERVER =
  process.env.EXPO_PUBLIC_DEFAULT_SERVER ??
  (Platform.OS === "android" ? "http://10.0.2.2:3000" : "http://localhost:3000");

export const serverUrlStore = {
  get: (): string | null => Storage.getItemSync(SERVER_URL),
  set: (url: string) => Storage.setItemSync(SERVER_URL, url),
};

/// What this phone is called to the account and in other devices' merge editors:
/// "iPhone", "iPad" or "Android phone", as the device calls itself where it can.
export function deviceName(): string {
  if (Platform.OS === "ios") return Platform.isPad ? "Nookly on iPad" : "Nookly on iPhone";
  return "Nookly on Android";
}

export type MobileSync = SyncRuntime<ApiClient>;

/// The phone's sync: the same runtime and engine as the desktop's.
export function createSync(db: PhoneDb, onApplied: () => void): MobileSync {
  return new SyncRuntime<ApiClient>({
    driver: db.driver,
    backup: () => backUpBeforeSync(db.sqlite),
    blobs: (serverUrl, api) => phoneBlobs(serverUrl, api, db.driver),
    settings: settingsBridge,
    connect: (baseUrl, onSignedOut) =>
      new ApiClient({ baseUrl, tokens: secureTokens, onSignedOut }),
    device: {
      name: deviceName(),
      platform: Platform.OS === "ios" ? "ios" : "android",
    },
    newId: randomUUID,
    onApplied,
  });
}
