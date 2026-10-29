import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it } from "vitest";
import { actionsFor, type MenuHelpers } from "#/components/context-menu/registry.ts";
import { makeEntity } from "#/test/fixtures.ts";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import "#/components/context-menu/entity-actions.tsx";
import "./context-actions.tsx";

// SAFETY: the Copy Link actions only read the ids of the target, never its editor.
const NO_EDITOR = null as never;

const helpers: MenuHelpers = {
  queryClient: new QueryClient(),
  close: () => {},
  refresh: async () => {},
  openPopover: () => {},
  openDialog: () => {},
};

beforeEach(() => {
  mockCommand("plugin:clipboard-manager|write_text", null);
});

describe("the Copy Link actions", () => {
  it("sit right next to Copy Mention for an entity", () => {
    const ids = actionsFor("entity").map((a) => a.id);
    expect(ids.indexOf("copy-deep-link")).toBe(ids.indexOf("copy-link") + 1);
    const link = actionsFor("entity").find((a) => a.id === "copy-deep-link");
    expect(link?.label).toBe("Copy Link");
    expect(link?.group).toBe(actionsFor("entity").find((a) => a.id === "copy-link")?.group);
  });

  it("copy a nookly link to the entity", async () => {
    const link = actionsFor("entity").find((a) => a.id === "copy-deep-link");
    await link?.run?.({ entity: makeEntity({ id: "abc-123" }) }, helpers);
    expect(callsOf("plugin:clipboard-manager|write_text")[0]).toMatchObject({
      text: "nookly://open/abc-123",
    });
  });

  it("sit next to Copy Mention for Block, and copy a link to the block", async () => {
    const ids = actionsFor("note.block").map((a) => a.id);
    expect(ids.indexOf("copy-block-deep-link")).toBe(ids.indexOf("copy-block-link") + 1);
    const link = actionsFor("note.block").find((a) => a.id === "copy-block-deep-link");
    expect(link?.label).toBe("Copy Link for Block");
    mockCommand("get_entity", makeEntity({ id: "page-1" }));
    await link?.run?.(
      {
        editor: NO_EDITOR,
        blockId: "client-1",
        entityId: "page-1",
        resolveStoredId: async () => "stored-9",
      },
      helpers,
    );
    expect(callsOf("plugin:clipboard-manager|write_text")[0]).toMatchObject({
      text: "nookly://open/page-1#stored-9",
    });
  });

  it("copy no link for a block that was never saved", async () => {
    const link = actionsFor("note.block").find((a) => a.id === "copy-block-deep-link");
    mockCommand("get_entity", makeEntity({ id: "p" }));
    await expect(
      link?.run?.(
        { editor: NO_EDITOR, blockId: "c", entityId: "p", resolveStoredId: async () => null },
        helpers,
      ),
    ).rejects.toThrow("Block not saved yet");
    expect(callsOf("plugin:clipboard-manager|write_text")).toHaveLength(0);
  });
});
