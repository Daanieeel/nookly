import { describe, expect, it } from "vitest";
import { makeEntity } from "#/test/fixtures.ts";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import {
  entityTypeOfKind,
  exportEntityJson,
  importEntityJson,
  importEntityText,
  isPortableType,
  previewEntityJson,
  previewEntityText,
  renderEntityJson,
} from "./portable.ts";

describe("what has a file format", () => {
  it.each(["note", "jot", "task", "index_card_deck", "assignment"])("%s does", (type) => {
    expect(isPortableType(type)).toBe(true);
  });

  it.each(["course", "file", "exam", "sub_task", "session", "bookmark"])("%s does not", (type) => {
    expect(isPortableType(type)).toBe(false);
  });

  it("makes an index card deck from a deck file, and the same type for the rest", () => {
    expect(entityTypeOfKind("deck")).toBe("index_card_deck");
    for (const kind of ["note", "jot", "task", "assignment"]) {
      expect(entityTypeOfKind(kind)).toBe(kind);
    }
  });
});

describe("the portable commands", () => {
  it("export, render and preview call the generic commands", async () => {
    mockCommand("export_entity_json", null);
    mockCommand("render_entity_json", "{}");
    mockCommand("preview_entity_json", { kind: "task" });
    mockCommand("preview_entity_text", { kind: "deck" });
    await exportEntityJson("t1", "/tmp/a.json");
    expect(await renderEntityJson("t1")).toBe("{}");
    await previewEntityJson("/tmp/a.json");
    await previewEntityText("{}");
    expect(callsOf("export_entity_json")[0]).toEqual({ entityId: "t1", path: "/tmp/a.json" });
    expect(callsOf("preview_entity_json")[0]).toEqual({ path: "/tmp/a.json" });
    expect(callsOf("preview_entity_text")[0]).toEqual({ text: "{}" });
  });

  it("import sends the Space, the source and the parent, or none", async () => {
    mockCommand("import_entity_json", makeEntity());
    mockCommand("import_entity_text", makeEntity());
    await importEntityJson("s1", "/tmp/a.json");
    await importEntityJson("s1", "/tmp/b.json", "course-1");
    await importEntityText("s1", "{}", "course-1");
    expect(callsOf("import_entity_json")).toEqual([
      { spaceId: "s1", path: "/tmp/a.json", parentId: null },
      { spaceId: "s1", path: "/tmp/b.json", parentId: "course-1" },
    ]);
    expect(callsOf("import_entity_text")[0]).toEqual({
      spaceId: "s1",
      text: "{}",
      parentId: "course-1",
    });
  });
});
