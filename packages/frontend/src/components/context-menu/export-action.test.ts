import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { makeEntity } from "#/test/fixtures.ts";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { actionsFor } from "./registry.ts";
import "./entity-actions.tsx";

const exportAction = () => {
  const found = actionsFor("entity").find((a) => a.id === "export-nookly-file");
  if (!found) throw new Error("the export action is not registered");
  return found;
};

describe("the right click export of a Nookly file", () => {
  it.each(["task", "index_card_deck", "assignment"])("is offered for a %s", (type) => {
    const entity = makeEntity({ type });
    expect(exportAction().when?.({ entity })).toBe(true);
  });

  it.each(["note", "jot", "course", "file", "exam", "sub_task"])(
    "is not offered for a %s (a page has its own, the rest have no file)",
    (type) => {
      expect(exportAction().when?.({ entity: makeEntity({ type }) })).toBe(false);
    },
  );

  it("names the file after what it is, in the share group", () => {
    const action = exportAction();
    expect(action.group).toBe("share");
    const labelOf = (type: string) => {
      const label = action.label;
      return label instanceof Function ? label({ entity: makeEntity({ type }) }) : label;
    };
    expect(labelOf("task")).toBe("Export as Nookly Task (.json)");
    expect(labelOf("assignment")).toBe("Export as Nookly Assignment (.json)");
  });

  it("saves the entity through the save dialog", async () => {
    mockCommand("plugin:dialog|save", "/tmp/Task.nookly.json");
    mockCommand("export_entity_json", null);
    const entity = makeEntity({ id: "t1", type: "task", title: "Task" });
    const run = exportAction().run;
    if (!run) throw new Error("no run");
    // A cancelled dialog resolves false (the item goes back to rest), a save resolves true.
    await run(
      { entity },
      // The action ignores its helpers.
      {
        queryClient: new QueryClient(),
        close: () => {},
        refresh: async () => {},
        openPopover: () => {},
        openDialog: () => {},
      },
    );
    expect(callsOf("export_entity_json")[0]).toEqual({
      entityId: "t1",
      path: "/tmp/Task.nookly.json",
    });
  });
});
