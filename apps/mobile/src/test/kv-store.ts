/// The phone's key value store (`expo-sqlite/kv-store`, where settings live) has no
/// native side in tests: this stands in for it, in memory (`jest.config.js` maps the
/// module here), emptied before each test by `jest.after.ts`.
const store = new Map<string, string>();

const Storage = {
  getItemSync: (key: string): string | null => store.get(key) ?? null,
  setItemSync: (key: string, value: string): void => void store.set(key, value),
  removeItemSync: (key: string): boolean => store.delete(key),
  clear: (): void => store.clear(),
};

export default Storage;
