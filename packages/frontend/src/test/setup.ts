import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { useDateTimeSettings } from "#/lib/datetime.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { preferences } from "#/lib/preferences.ts";
import { SETTING_IDS } from "#/lib/settings/registry.ts";
import { settings } from "#/lib/settings/settings.ts";
import { installTauriMock, uninstallTauriMock } from "./tauri.ts";

// jsdom lacks the layout and pointer APIs Radix calls; they do nothing here.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= NoopResizeObserver;
Element.prototype.scrollIntoView ??= () => {};
// ProseMirror measures ranges when it scrolls the caret into view; there is no layout to measure.
function emptyRects(): DOMRectList {
  // SAFETY: an empty list is all any caller reads, and jsdom has no `DOMRectList` to construct.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- jsdom lacks DOMRectList, so the empty list is cast through unknown
  return Object.assign([], { item: () => null }) as unknown as DOMRectList;
}
Range.prototype.getClientRects ??= emptyRects;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();
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
  for (const id of SETTING_IDS) settings.reset(id);
  useDateTimeSettings.setState({
    timezone: "system",
    dateFormat: "timezone",
    timeFormat: "timezone",
  });
});
