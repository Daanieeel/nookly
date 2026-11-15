import { forgetPreferences } from "./src/data/preferences.ts";
import Storage from "./src/test/kv-store.ts";

// The phone's in memory key value store, emptied before each test.
beforeEach(() => {
  // No test reaches the network: a fetch fails as offline unless a test answers it, and a
  // test's own answer never leaks into the next.
  globalThis.fetch = jest.fn(() => Promise.reject(new TypeError("Network request failed")));
  Storage.clear();
  forgetPreferences();
});
