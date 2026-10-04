import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { useDateTimeSettings } from "#/lib/datetime.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { preferences } from "#/lib/preferences.ts";
import { installTauriMock, uninstallTauriMock } from "./tauri.ts";

// jsdom lacks the layout and pointer APIs Radix calls; they do nothing here.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= NoopResizeObserver;
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};

beforeEach(() => {
  installTauriMock();
});

afterEach(() => {
  cleanup();
  uninstallTauriMock();
  vi.useRealTimers();
  // Preferences live in memory until `initPreferences` loads a store, which tests
  // never do, so clearing every key gives the next test a fresh device.
  for (const key of Object.values(STORAGE_KEYS)) preferences.remove(key);
  useDateTimeSettings.setState({
    timezone: "system",
    dateFormat: "timezone",
    timeFormat: "timezone",
  });
});
