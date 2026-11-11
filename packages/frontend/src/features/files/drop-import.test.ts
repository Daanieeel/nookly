import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it } from "vitest";
import { makeEntity, makeFile } from "#/test/fixtures.ts";
import { callsOf, mockCommand, mockCommandWith } from "#/test/tauri.ts";
import { importDroppedFiles, readDropZone } from "./drop-import.ts";

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const pdf = (name = "notes.pdf") => new File(["hi"], name, { type: "application/pdf" });

beforeEach(() => {
  let n = 0;
  mockCommandWith("import_file_from_bytes", () =>
    makeFile({}, { id: `file-${++n}`, spaceId: "s1" }),
  );
  mockCommand("create_relationship", null);
});

describe("readDropZone", () => {
  it("reads the Space and the page off a marked element", () => {
    const el = document.createElement("div");
    el.setAttribute("data-file-drop", "s1");
    el.setAttribute("data-file-drop-entity", "e1");
    expect(readDropZone(el)).toEqual({ spaceId: "s1", entityId: "e1" });
  });

  it("is null outside a zone", () => {
    expect(readDropZone(null)).toBeNull();
  });
});

describe("importDroppedFiles", () => {
  it("imports each dropped file into the Space", async () => {
    await importDroppedFiles(client(), [pdf("a.pdf"), pdf("b.pdf")], { spaceId: "s1" });
    expect(callsOf("import_file_from_bytes")).toHaveLength(2);
    expect(callsOf("create_relationship")).toHaveLength(0);
  });

  it("attaches each file to the page it was dropped on", async () => {
    mockCommand("get_entity", makeEntity({ id: "e1", type: "task", spaceId: "s1" }));
    await importDroppedFiles(client(), [pdf()], { spaceId: "s1", entityId: "e1" });
    expect(callsOf("create_relationship")[0]).toMatchObject({
      fromEntityId: "e1",
      toEntityId: "file-1",
      relationshipType: "attached-file",
    });
  });

  it("only imports when the page is a file, which has no attachments", async () => {
    mockCommand("get_entity", makeEntity({ id: "e1", type: "file", spaceId: "s1" }));
    await importDroppedFiles(client(), [pdf()], { spaceId: "s1", entityId: "e1" });
    expect(callsOf("import_file_from_bytes")).toHaveLength(1);
    expect(callsOf("create_relationship")).toHaveLength(0);
  });

  it("keeps importing the rest when one file fails", async () => {
    let n = 0;
    mockCommandWith("import_file_from_bytes", () => {
      if (++n === 1) throw new Error("disk full");
      return makeFile({}, { id: "file-ok", spaceId: "s1" });
    });
    await importDroppedFiles(client(), [pdf("bad.pdf"), pdf("good.pdf")], { spaceId: "s1" });
    expect(callsOf("import_file_from_bytes")).toHaveLength(2);
  });
});
