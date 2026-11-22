import { beforeEach, describe, expect, it } from "vitest";
import type { LocalDb } from "./db.ts";
import { rows, write } from "./db.ts";
import { createSpace, trashEntity } from "./entities.ts";
import { createCourse } from "./study.ts";
import { createPage } from "./notes.ts";
import { createLabel, entityLabels } from "./links.ts";
import {
  addFile,
  addFileLink,
  detectProvider,
  fileKindOf,
  fileWithOrigin,
  getFile,
  importFileWithDetails,
  isDownloading,
  isLinkOnly,
  isTextFile,
  listFiles,
  renameFile,
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

  it("renames a file and keeps its extension, so it still opens as what it is", async () => {
    const space = await createSpace(db, "S", "#000000");
    const id = await addFile(db, space, "Scan 14 Nov 2026.pdf", "file:///docs/files/abc-scan.pdf");
    await renameFile(db, id, "  Lease contract ");
    expect(await getFile(db, id)).toMatchObject({
      originalFilename: "Lease contract.pdf",
      localPath: "file:///docs/files/abc-scan.pdf",
      entity: { title: "Lease contract.pdf" },
    });
    await renameFile(db, id, "Lease.pdf");
    expect((await getFile(db, id))?.originalFilename).toBe("Lease.pdf");
    await renameFile(db, id, "   ");
    expect((await getFile(db, id))?.originalFilename).toBe("Lease.pdf");
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

describe("links to files", () => {
  it("recognises the providers by name like the desktop", () => {
    expect(detectProvider("https://drive.google.com/file/d/x")).toBe("google_drive");
    expect(detectProvider("https://www.dropbox.com/s/x/a.pdf")).toBe("dropbox");
    expect(detectProvider("https://www.icloud.com/iclouddrive/x")).toBe("icloud");
    expect(detectProvider("https://example.com/a.pdf")).toBeNull();
  });

  it("adds a link as a file with no stored copy", async () => {
    const space = await createSpace(db, "S", "#000000");
    const id = await addFileLink(
      db,
      space,
      "https://www.dropbox.com/s/abc/Report%20final.pdf?dl=0",
    );
    const file = await getFile(db, id);
    expect(file).toMatchObject({
      provider: "dropbox",
      originalFilename: "Report final.pdf",
      url: "https://www.dropbox.com/s/abc/Report%20final.pdf?dl=0",
    });
    expect(isLinkOnly(file!)).toBe(true);
  });

  it("sends a web page to the bookmarks and refuses what is no link", async () => {
    const space = await createSpace(db, "S", "#000000");
    await expect(addFileLink(db, space, "https://example.com/blog/post")).rejects.toThrow(
      /bookmark/,
    );
    await expect(addFileLink(db, space, "example.com/a.pdf")).rejects.toThrow(/http/);
    expect(await listFiles(db, space)).toEqual([]);
  });
});

describe("a file imported with its details", () => {
  // The desktop's `import_file_with_details`: a Moodle file lands named, labelled and
  // attached to its course at once, and remembers where it came from.
  it("lands named, labelled and attached, with where it came from", async () => {
    const space = await createSpace(db, "Uni", "#000000");
    const course = await createCourse(db, space, "Algorithms");
    const existing = await createLabel(db, space, "ALG");
    const id = await importFileWithDetails(db, space, {
      filename: "lecture1.pdf",
      localPath: "file:///docs/moodle-files/a/lecture1.pdf",
      title: "Lecture 1.pdf",
      origin: "moodle:https://moodle.uni.edu/pluginfile.php/1/lecture1.pdf",
      labelIds: [],
      newLabels: ["alg", "Week 1"],
      attachTo: [course],
    });
    const file = await getFile(db, id);
    expect(file?.entity.title).toBe("Lecture 1.pdf");
    expect(file?.localPath).toBe("file:///docs/moodle-files/a/lecture1.pdf");
    const labels = await entityLabels(db, id);
    expect(labels.map((l) => l.name).sort()).toEqual(["ALG", "Week 1"]);
    expect(labels.find((l) => l.name === "ALG")?.id).toBe(existing);
    const links = await rows(
      db,
      "SELECT from_entity_id, relationship_type FROM relationships WHERE to_entity_id = ?",
      id,
    );
    expect(links).toEqual([{ from_entity_id: course, relationship_type: "attached-file" }]);
    expect(
      await fileWithOrigin(db, "moodle:https://moodle.uni.edu/pluginfile.php/1/lecture1.pdf"),
    ).toBe(id);
  });

  it("counts a file in the Trash as not imported", async () => {
    const space = await createSpace(db, "Uni", "#000000");
    const origin = "moodle:https://moodle.uni.edu/pluginfile.php/2/a.pdf";
    const id = await importFileWithDetails(db, space, {
      filename: "a.pdf",
      localPath: "file:///a.pdf",
      origin,
      labelIds: [],
      newLabels: [],
      attachTo: [],
    });
    await trashEntity(db, id);
    expect(await fileWithOrigin(db, origin)).toBeNull();
  });

  it("makes nothing when a part fails", async () => {
    const space = await createSpace(db, "Uni", "#000000");
    await expect(
      importFileWithDetails(db, space, {
        filename: "a.pdf",
        localPath: "file:///a.pdf",
        origin: "moodle:x",
        labelIds: [],
        newLabels: ["  "],
        attachTo: [],
      }),
    ).rejects.toThrow();
    expect(await listFiles(db, space)).toEqual([]);
  });
});

/// A link of any type, written as sync or the desktop would: some are not made by hand.
const link = (from: string, to: string, type: string) =>
  write(db, [
    {
      sql: "INSERT INTO relationships (id, from_entity_id, to_entity_id, relationship_type, created_at) VALUES (?, ?, ?, ?, ?)",
      params: [db.newId(), from, to, type, "2026-01-01T00:00:00.000Z"],
    },
  ]);

describe("what a file is attached to", () => {
  it("lists the entities it is attached to and the courses it belongs to, directly or through them", async () => {
    const space = await createSpace(db, "Uni", "#000000");
    const maths = await createCourse(db, space, "Maths");
    const note = await createPage(db, space, "note", "Week 1");
    await link(maths, note, "course-notes");
    const direct = await addFile(db, space, "direct.pdf", "file:///direct.pdf");
    const throughNote = await addFile(db, space, "through.pdf", "file:///through.pdf");
    const loose = await addFile(db, space, "loose.pdf", "file:///loose.pdf");
    await link(maths, direct, "attached-file");
    await link(note, throughNote, "attached-file");

    const files = await listFiles(db, space);
    const of = (id: string) => files.find((f) => f.entity.id === id);
    expect(of(direct)?.attachedTo.map((e) => e.title)).toEqual(["Maths"]);
    expect(of(direct)?.courses.map((c) => c.title)).toEqual(["Maths"]);
    expect(of(throughNote)?.attachedTo.map((e) => e.title)).toEqual(["Week 1"]);
    expect(of(throughNote)?.courses.map((c) => c.title)).toEqual(["Maths"]);
    expect(of(loose)?.attachedTo).toEqual([]);
    expect(of(loose)?.courses).toEqual([]);
    expect((await getFile(db, throughNote))?.courses.map((c) => c.title)).toEqual(["Maths"]);
  });

  it("leaves out an owner or course in the Trash", async () => {
    const space = await createSpace(db, "Uni", "#000000");
    const maths = await createCourse(db, space, "Maths");
    const file = await addFile(db, space, "a.pdf", "file:///a.pdf");
    await link(maths, file, "attached-file");
    await trashEntity(db, maths);
    const [listed] = await listFiles(db, space);
    expect(listed?.attachedTo).toEqual([]);
    expect(listed?.courses).toEqual([]);
  });
});
