import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "./storage-keys.ts";

/// A fresh store, as the app builds it on launch from the stored `value`.
async function load(value?: string) {
  vi.resetModules();
  const { preferences } = await import("./preferences.ts");
  if (value === undefined) preferences.remove(STORAGE_KEYS.swipeHintDone);
  else preferences.set(STORAGE_KEYS.swipeHintDone, value);
  const { useSwipeHint } = await import("./swipe-hint.ts");
  return { store: useSwipeHint, preferences };
}

describe("the swipe hint", () => {
  beforeEach(() => vi.resetModules());

  it("is still to be shown on a fresh install and for everyone updating", async () => {
    expect((await load()).store.getState().done).toBe(false);
  });

  it("is done once it was used, and remembers it", async () => {
    const { store, preferences } = await load();
    store.getState().markDone();
    expect(store.getState().done).toBe(true);
    expect(preferences.get(STORAGE_KEYS.swipeHintDone)).toBe("1");
    expect((await load("1")).store.getState().done).toBe(true);
  });

  it("ignores any stored value but 1", async () => {
    expect((await load("0")).store.getState().done).toBe(false);
  });
});
