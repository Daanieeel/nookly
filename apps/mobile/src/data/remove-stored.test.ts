import { type StoredCopy, removeStored } from "./remove-stored.ts";

const FOLDER = "file:///app/Documents/files/";

/// A file on a disk in memory, hashed as its own contents.
function copy(disk: Map<string, string>, uri: string): StoredCopy {
  return {
    uri,
    get exists() {
      return disk.has(uri);
    },
    sha256: async () => disk.get(uri) ?? "",
    delete: () => void disk.delete(uri),
  };
}

describe("removing a stored file on sign out", () => {
  const stored = `${FOLDER}a.pdf`;

  it("deletes one in the app's files folder that is unchanged", async () => {
    const disk = new Map([[stored, "hash"]]);
    await expect(removeStored(copy(disk, stored), FOLDER, "hash")).resolves.toBe(true);
    expect(disk.has(stored)).toBe(false);
  });

  it("keeps one that changed since it was sent, and says nothing of a missing one", async () => {
    const disk = new Map([[stored, "edited since"]]);
    await expect(removeStored(copy(disk, stored), FOLDER, "hash")).resolves.toBe(false);
    expect(disk.has(stored)).toBe(true);
    await expect(removeStored(copy(new Map(), stored), FOLDER, "hash")).resolves.toBe(false);
  });

  it("keeps anything outside the files folder", async () => {
    for (const path of [
      "file:///app/Documents/kept-backups/b.zip",
      `${FOLDER}../kept-backups/b.zip`,
      "file:///elsewhere/files/a.pdf",
    ]) {
      const disk = new Map([[path, "hash"]]);
      await expect(removeStored(copy(disk, path), FOLDER, "hash")).resolves.toBe(false);
      expect(disk.has(path)).toBe(true);
    }
  });
});
