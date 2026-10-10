import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EntityActions } from "#/components/entity-actions.tsx";
import { makeEntity } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { nooklyFileLabel, nooklyFileNoun, saveNooklyFile } from "./save-nookly-file.tsx";

describe("the names of a Nookly file", () => {
  it.each([
    ["note", "Page"],
    ["jot", "Page"],
    ["task", "Task"],
    ["index_card_deck", "Deck"],
    ["assignment", "Assignment"],
    ["course", "File"],
  ])("a %s is a %s", (type, noun) => {
    expect(nooklyFileNoun(type)).toBe(noun);
    expect(nooklyFileLabel(type)).toBe(`Export as Nookly ${noun} (.json)`);
  });
});

describe("saveNooklyFile", () => {
  it("writes the entity to the path chosen, named after it without characters a file cannot hold", async () => {
    mockCommand("plugin:dialog|save", "/tmp/Plan.nookly.json");
    mockCommand("export_entity_json", null);
    const task = makeEntity({ id: "t1", type: "task", title: "Plan: week 3?" });
    expect(await saveNooklyFile(task)).toBe(true);
    expect(callsOf("plugin:dialog|save")[0]).toMatchObject({
      options: { defaultPath: "Plan week 3.nookly.json" },
    });
    expect(callsOf("export_entity_json")[0]).toEqual({
      entityId: "t1",
      path: "/tmp/Plan.nookly.json",
    });
  });

  it("writes nothing when the save dialog is cancelled", async () => {
    mockCommand("plugin:dialog|save", null);
    mockCommand("export_entity_json", null);
    expect(await saveNooklyFile(makeEntity({ type: "task" }))).toBe(false);
    expect(callsOf("export_entity_json")).toHaveLength(0);
  });
});

function setup(entity: ReturnType<typeof makeEntity>, exportable = false) {
  return renderWithProviders(
    <EntityActions
      entity={entity}
      exportable={exportable}
      pin={{ status: "idle", toggle: async () => {} }}
      onTrash={() => {}}
    />,
  );
}

describe("export in the more actions menu of other things", () => {
  it.each([
    ["task", "Export as Nookly Task (.json)"],
    ["index_card_deck", "Export as Nookly Deck (.json)"],
    ["assignment", "Export as Nookly Assignment (.json)"],
  ])("a %s offers %s", async (type, label) => {
    mockCommand("plugin:dialog|save", "/tmp/x.nookly.json");
    mockCommand("export_entity_json", null);
    const entity = makeEntity({ id: "e1", type, title: "Thing" });
    const { user } = setup(entity);
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: label }));
    await waitFor(() => expect(callsOf("export_entity_json")).toHaveLength(1));
    expect(callsOf("export_entity_json")[0]).toEqual({
      entityId: "e1",
      path: "/tmp/x.nookly.json",
    });
  });

  it("is not offered for a type with no file format", async () => {
    const { user } = setup(makeEntity({ type: "course", title: "Physics" }));
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await screen.findByRole("menuitem", { name: /Pin/ });
    expect(screen.queryByRole("menuitem", { name: /Export as Nookly/ })).toBeNull();
  });

  it("is offered once on a page, in its export group, not twice", async () => {
    const { user } = setup(makeEntity({ type: "note", title: "N" }), true);
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await screen.findByRole("menuitem", { name: /Export as Nookly Page/ });
    expect(screen.getAllByRole("menuitem", { name: /Export as Nookly/ })).toHaveLength(1);
  });
});
