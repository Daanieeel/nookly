import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeEntity } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { mockCommand } from "#/test/tauri.ts";
import { EntityActions } from "./entity-actions.tsx";

const note = makeEntity({ id: "note-1", type: "note", title: "Physics" });

async function openMoreActions(entity = note, exportable = true) {
  const view = renderWithProviders(
    <EntityActions
      entity={entity}
      exportable={exportable}
      pin={{ status: "idle", toggle: async () => {} }}
      onTrash={() => {}}
    />,
  );
  await view.user.click(screen.getByRole("button", { name: "More actions" }));
  return view;
}

describe("EntityActions relationship graph", () => {
  it("opens the relationship graph from a button on the page", async () => {
    mockCommand("list_relationships", []);
    mockCommand("list_relationship_types", []);
    const { user } = renderWithProviders(
      <EntityActions
        entity={note}
        exportable
        pin={{ status: "idle", toggle: async () => {} }}
        onTrash={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Show Relationship Graph" }));
    expect(await screen.findByRole("dialog", { name: "Relationship graph" })).toBeInTheDocument();
    expect(await screen.findByText("No relationships yet")).toBeInTheDocument();
  });
});

describe("EntityActions more menu", () => {
  it("offers every page export, including the Nookly page file", async () => {
    await openMoreActions();
    expect(await screen.findByRole("menuitem", { name: "Export..." })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Copy Page as Markdown/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Export as Nookly Page/ })).toBeInTheDocument();
    // Markdown files are saved from the Export dialog now.
    expect(screen.queryByRole("menuitem", { name: /Save as Markdown file/ })).toBeNull();
  });

  it("opens the Export dialog from the more actions menu", async () => {
    const { user } = await openMoreActions();
    await user.click(await screen.findByRole("menuitem", { name: "Export..." }));
    expect(await screen.findByRole("dialog", { name: "Export Page" })).toBeInTheDocument();
  });

  it("has no export for an entity that is not a page", async () => {
    await openMoreActions(makeEntity({ id: "t1", type: "task" }), false);
    await screen.findByRole("menuitem", { name: /Pin/ });
    expect(screen.queryByRole("menuitem", { name: /Export as Nookly Page/ })).toBeNull();
  });
});
