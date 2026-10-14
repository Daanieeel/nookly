import { beforeEach, describe, expect, it } from "vitest";
import type { LocalDb } from "./db.ts";
import { createSpace, trashEntity } from "./entities.ts";
import {
  addFile,
  fileKindOf,
  getFile,
  isDownloading,
  isLinkOnly,
  isTextFile,
  listFiles,
} from "./files.ts";
import { testDb } from "./test-db.ts";

let db: LocalDb;
beforeEach(() => {
  db = testDb();
});

describe("files", () => {
  it("adds a file stored on the device and lists it newest first", async () => {
    const space = await createSpace(db, "S", "#000000");
    const a = await addFile(db, space, "notes.pdf", "file:///docs/files/abc-notes.pdf");
    const b = await addFile(db, space, "photo.jpg", "file:///docs/files/def-photo.jpg");
    const files = await listFiles(db, space);
    expect(files.map((f) => f.entity.id)).toEqual([b, a]);
    expect(files[1]).toMatchObject({
      localPath: "file:///docs/files/abc-notes.pdf",
      originalFilename: "notes.pdf",
      blob: null,
    });
    expect(files[1].entity.key).toMatch(/^FIL-/);
    expect(await getFile(db, a)).toMatchObject({ entity: { title: "notes.pdf" } });
  });

  it("leaves out trashed files, and files of another Space when asked for one", async () => {
    const one = await createSpace(db, "One", "#000000");
    const two = await createSpace(db, "Two", "#000000");
    const kept = await addFile(db, one, "a.txt", "file:///a.txt");
    const gone = await addFile(db, one, "b.txt", "file:///b.txt");
    await addFile(db, two, "c.txt", "file:///c.txt");
    await trashEntity(db, gone);
    expect((await listFiles(db, one)).map((f) => f.entity.id)).toEqual([kept]);
    expect(await listFiles(db)).toHaveLength(2);
  });

  it("knows when contents are still on their way, or never were", async () => {
    const space = await createSpace(db, "S", "#000000");
    const id = await addFile(db, space, "a.txt", "file:///a.txt");
    const file = await getFile(db, id);
    if (!file) throw new Error("missing");
    expect(isDownloading(file)).toBe(false);
    expect(isDownloading({ ...file, localPath: null, blob: "abc" })).toBe(true);
    expect(isLinkOnly({ ...file, localPath: null, url: "https://example.com/x" })).toBe(true);
  });

  it("sorts by extension like the desktop's viewer", () => {
    expect(fileKindOf("Notes.PDF")).toBe("pdf");
    expect(fileKindOf("photo.heic")).toBe("image");
    expect(fileKindOf("main.rs")).toBe("code");
    expect(fileKindOf("README")).toBe("other");
    expect(fileKindOf(".hidden")).toBe("other");
    expect(isTextFile("log.txt")).toBe(true);
    expect(isTextFile("deck.pdf")).toBe(false);
  });
});
