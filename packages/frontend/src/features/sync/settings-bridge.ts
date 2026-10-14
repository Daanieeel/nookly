import type { JsonValue } from "@nookly/shared/api";
import { SYNCED_SETTINGS, type SettingsBridge } from "@nookly/shared/sync";
import { readSettingsValues, settings, subscribeSetting } from "#/lib/settings/settings.ts";

/// The desktop's `settings.json` as account settings sync sees it: the settings
/// that follow the account, read and written through the same store as Settings.
export const settingsBridge: SettingsBridge = {
  get: (key): JsonValue => settings.get(key),
  isDefault: (key) => !Object.hasOwn(readSettingsValues(), key),
  set: (key, value) => {
    if (value === undefined) settings.reset(key);
    else settings.apply([{ id: key, value }]);
  },
  subscribe: (listener) => {
    const stops = SYNCED_SETTINGS.map((key) => subscribeSetting(key, () => listener(key)));
    return () => {
      for (const stop of stops) stop();
    };
  },
};
