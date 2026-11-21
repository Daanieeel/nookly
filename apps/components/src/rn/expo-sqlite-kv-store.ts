// The phone's key value store, kept in memory for the gallery.
const memory = new Map<string, string>();

const Storage = {
  getItemSync: (key: string) => memory.get(key) ?? null,
  setItemSync: (key: string, value: string) => void memory.set(key, value),
  removeItemSync: (key: string) => memory.delete(key),
  getItem: async (key: string) => memory.get(key) ?? null,
  setItem: async (key: string, value: string) => void memory.set(key, value),
  removeItem: async (key: string) => memory.delete(key),
};

export default Storage;
