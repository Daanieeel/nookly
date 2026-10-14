import { ApiClient, type TokenStore } from "@nookly/shared/api";
import type { LocalDb } from "@nookly/shared/data";
import { SyncRuntime } from "@nookly/shared/sync";
import { randomUUID } from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import Storage from "expo-sqlite/kv-store";
import { Platform } from "react-native";

const REFRESH_TOKEN = "nookly.sync.refreshToken";
const SERVER_URL = "nookly.sync.serverUrl";

/// The sync account's refresh token, in the Keychain or Keystore; never in the database.
const secureTokens: TokenStore = {
  load: () => SecureStore.getItemAsync(REFRESH_TOKEN),
  save: async (token) => {
    if (token) await SecureStore.setItemAsync(REFRESH_TOKEN, token);
    else await SecureStore.deleteItemAsync(REFRESH_TOKEN);
  },
};

/// The sync server's address, a device preference.
const THEME = "nookly.theme";

/// The theme picked in Settings, on this phone.
export const themeStore = {
  get: (): string | null => Storage.getItemSync(THEME),
  set: (theme: string) => Storage.setItemSync(THEME, theme),
};

export const serverUrlStore = {
  get: (): string | null => Storage.getItemSync(SERVER_URL),
  set: (url: string) => Storage.setItemSync(SERVER_URL, url),
};

export type MobileSync = SyncRuntime<ApiClient>;

/// The phone's sync: the same runtime and engine as the desktop's.
export function createSync(db: LocalDb, onApplied: () => void): MobileSync {
  return new SyncRuntime<ApiClient>({
    driver: db.driver,
    connect: (baseUrl, onSignedOut) =>
      new ApiClient({ baseUrl, tokens: secureTokens, onSignedOut }),
    device: {
      name: Platform.OS === "ios" ? "Nookly on iPhone" : "Nookly on Android",
      platform: Platform.OS === "ios" ? "ios" : "android",
    },
    newId: randomUUID,
    onApplied,
  });
}
