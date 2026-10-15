import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { TabGroupContext } from "#/components/tab-group-scope.ts";
import { tabGroups, useNavStore } from "#/lib/store/nav.ts";
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

  describe("in a split", () => {
    const initial = useNavStore.getState();
    afterEach(() => useNavStore.setState(initial, true));

    it("Mod+Shift+S collapses only the focused side's sidebar", async () => {
      mockCommand("list_relationships", []);
      mockCommand("list_relationship_types", []);
      mockCommand("list_blocks", []);
      mockCommand("list_mentioning_entities", []);
      mockCommand("list_labels", []);
      mockCommand("list_labels_for_entity", []);
      mockCommand("list_spaces", []);
      useNavStore.getState().setRightSidebarCollapsed(false);
      useNavStore.getState().splitRight();
      const [left, right] = tabGroups(useNavStore.getState());
      const side = (groupId: string) => (
        <TabGroupContext.Provider
          value={{ groupId, tabId: groupId, view: { kind: "dashboard" }, focused: false }}
        >
          <div data-testid={groupId}>
            <RightSidebar entity={makeEntity({ type: "note" })} actions={() => null} />
          </div>
        </TabGroupContext.Provider>
      );
      renderWithProviders(
        <>
          {side(left.id)}
          {side(right.id)}
        </>,
      );
      const resizer = (groupId: string) =>
        within(screen.getByTestId(groupId)).queryByRole("separator", { name: "Resize sidebar" });
      expect(resizer(left.id)).not.toBeNull();
      expect(resizer(right.id)).not.toBeNull();

      // Mod is Control off macOS, which the test environment is.
      await userEvent.keyboard("{Control>}{Shift>}s{/Shift}{/Control}");

      expect(resizer(right.id)).toBeNull();
      expect(resizer(left.id)).not.toBeNull();
    });
  });
});
