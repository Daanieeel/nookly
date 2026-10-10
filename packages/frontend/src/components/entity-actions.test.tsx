import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeEntity } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
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

describe("EntityActions more menu", () => {
  it("offers every page export, including the Nookly page file", async () => {
    await openMoreActions();
    expect(
      await screen.findByRole("menuitem", { name: /Save as Markdown file/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Export as Nookly Page/ })).toBeInTheDocument();
  });

  it("has no export for an entity that is not a page", async () => {
    await openMoreActions(makeEntity({ id: "t1", type: "task" }), false);
    await screen.findByRole("menuitem", { name: /Pin/ });
    expect(screen.queryByRole("menuitem", { name: /Export as Nookly Page/ })).toBeNull();
  });
});
