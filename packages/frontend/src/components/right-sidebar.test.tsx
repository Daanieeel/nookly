import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeEntity } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { mockCommand } from "#/test/tauri.ts";
import { RightSidebar } from "./right-sidebar.tsx";

describe("RightSidebar", () => {
  it("draws a separator line below every section", async () => {
    mockCommand("list_relationships", []);
    mockCommand("list_relationship_types", []);
    mockCommand("list_blocks", []);
    mockCommand("list_mentioning_entities", []);
    mockCommand("list_labels", []);
    mockCommand("list_labels_for_entity", []);
    mockCommand("list_spaces", []);
    renderWithProviders(
      <RightSidebar entity={makeEntity({ type: "note" })} actions={() => null} />,
    );
    const heading = await screen.findByText("Relationships");
    const sections = heading.closest(".overflow-y-auto");
    // Every child but the toolbar gets a bottom border and room above it.
    expect(sections?.className).toContain("[&>*:not(:first-child)]:border-b");
    expect(sections?.className).toContain("[&>*:not(:first-child)]:pb-5");
  });

  it("keeps the Refine button's own height on a jot", async () => {
    mockCommand("list_relationships", []);
    mockCommand("list_relationship_types", []);
    mockCommand("list_blocks", []);
    mockCommand("list_mentioning_entities", []);
    mockCommand("list_labels", []);
    mockCommand("list_labels_for_entity", []);
    mockCommand("list_spaces", []);
    renderWithProviders(<RightSidebar entity={makeEntity({ type: "jot" })} actions={() => null} />);
    const button = await screen.findByRole("button", { name: /Refine into New Note/ });
    const sections = button.closest(".overflow-y-auto");
    // The sections container pads the bottom of its direct children (room above the
    // separator line), which squeezed a bare button's label to its top edge. The
    // button sits in a section of its own, so the padding goes there.
    expect(button.parentElement).not.toBe(sections);
  });
});
