import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { makeEntity } from "#/test/fixtures.ts";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { importPageFromFile } from "./import-page.ts";

describe("importPageFromFile", () => {
  it("imports the picked file into the Space and returns the new page", async () => {
    mockCommand("plugin:dialog|open", "/tmp/a.nookly.json");
    mockCommand("import_page_json", makeEntity({ id: "new-1", spaceId: "space-1", type: "note" }));
    const page = await importPageFromFile("space-1", new QueryClient());
    expect(page?.id).toBe("new-1");
    expect(callsOf("import_page_json")[0]).toEqual({
      spaceId: "space-1",
      path: "/tmp/a.nookly.json",
    });
  });

  it("does nothing when no file is picked", async () => {
    mockCommand("plugin:dialog|open", null);
    mockCommand("import_page_json", makeEntity());
    expect(await importPageFromFile("space-1", new QueryClient())).toBeNull();
    expect(callsOf("import_page_json")).toHaveLength(0);
  });
});
