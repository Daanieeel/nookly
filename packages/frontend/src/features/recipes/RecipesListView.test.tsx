import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Recipe } from "#/lib/api/types.ts";
import { makeEntity } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { installTauriMock, mockCommand, uninstallTauriMock } from "#/test/tauri.ts";
import { RecipesListView } from "./RecipesListView";

function recipe(id: string, title: string, patch: Partial<Recipe> = {}): Recipe {
  return {
    entity: makeEntity({ id, type: "recipe", title, key: `RCP-${id}` }),
    kind: "dinner",
    durationMinutes: null,
    bannerPath: null,
    totalDurationMinutes: 45,
    tags: [],
    ...patch,
  };
}

beforeEach(() => {
  installTauriMock();
  mockCommand("list_recipes", [
    recipe("1", "Lasagne"),
    recipe("2", "Chocolate cake", { kind: "dessert", totalDurationMinutes: 90 }),
    recipe("3", "Overnight oats", { kind: "breakfast", totalDurationMinutes: 10 }),
  ]);
});
afterEach(uninstallTauriMock);

describe("the Recipes page", () => {
  it("filters by kind, time and the fields every item has", async () => {
    const { user } = renderWithProviders(<RecipesListView spaceId="space-1" />);
    await screen.findByText("Lasagne");
    await user.click(screen.getByRole("button", { name: "Filter" }));
    for (const field of ["Kind", "Tags", "Time", "Pinned", "Created", "Updated"]) {
      expect(await screen.findByRole("option", { name: new RegExp(field) })).toBeInTheDocument();
    }
    await user.click(screen.getByRole("option", { name: /Time/ }));
    await user.click(await screen.findByRole("option", { name: /15 minutes or less/ }));
    await waitFor(() => expect(screen.queryByText("Lasagne")).toBeNull());
    expect(screen.getByText("Overnight oats")).toBeInTheDocument();
    expect(screen.queryByText("Chocolate cake")).toBeNull();
  });
});
