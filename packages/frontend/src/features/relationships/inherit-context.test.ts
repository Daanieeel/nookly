import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Relationship } from "#/lib/api/types.ts";
import { callsOf, installTauriMock, mockCommand, uninstallTauriMock } from "#/test/tauri.ts";
import { inheritPageContext } from "./inherit-context.ts";

function link(from: string, to: string, relationshipType: string): Relationship {
  return {
    id: `${from}-${to}-${relationshipType}`,
    fromEntityId: from,
    toEntityId: to,
    relationshipType,
    fromBlockId: null,
    toBlockId: null,
    createdAt: "",
  };
}

beforeEach(() => {
  installTauriMock();
  mockCommand("create_relationship", null);
});
afterEach(uninstallTauriMock);

describe("inheritPageContext", () => {
  it("attaches the file to the page and to every context the page belongs to", async () => {
    mockCommand("list_relationships", [
      link("session-1", "page-1", "session-note"),
      link("course-1", "page-1", "course-notes"),
      link("page-1", "other-1", "relates-to"),
      link("page-1", "task-1", "blocks"),
    ]);
    await inheritPageContext(new QueryClient(), "page-1", "file-1");
    const calls = callsOf("create_relationship");
    expect(calls).toHaveLength(4);
    for (const owner of ["course-1", "other-1", "page-1", "session-1"]) {
      expect(calls).toContainEqual(
        expect.objectContaining({
          fromEntityId: owner,
          toEntityId: "file-1",
          relationshipType: "attached-file",
        }),
      );
    }
  });

  it("only attaches to the page when it has no context", async () => {
    mockCommand("list_relationships", []);
    await inheritPageContext(new QueryClient(), "page-1", "file-1");
    expect(callsOf("create_relationship")).toHaveLength(1);
    expect(callsOf("create_relationship")[0]).toMatchObject({
      fromEntityId: "page-1",
      toEntityId: "file-1",
    });
  });
});
