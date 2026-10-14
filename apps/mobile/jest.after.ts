import Storage from "./src/test/kv-store.ts";

// The phone's in memory key value store, emptied before each test.
beforeEach(() => Storage.clear());
