import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useNavStore } from "#/lib/store/nav.ts";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { makeEntity, makeSpace } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { mockCommand, mockCommandWith } from "#/test/tauri.ts";
import { GRAPH_RING_CAP } from "./relationship-graph.ts";
import { RelationshipGraphPanel } from "./RelationshipGraphPanel.tsx";

const base = { fromBlockId: null, toBlockId: null, createdAt: "2026-01-01T00:00:00Z" };
const me = makeEntity({ id: "me", type: "note", title: "Physics" });

function link(id: string, from: string, to: string, relationshipType = "blocks") {
  return { ...base, id, fromEntityId: from, toEntityId: to, relationshipType };
}

function setup(relationships: Record<string, ReturnType<typeof link>[]>, onOpenChange = () => {}) {
  mockCommand("list_relationship_types", [
    { name: "blocks", label: "Blocks", inverseLabel: "Blocked by", description: "" },
  ]);
  mockCommand("list_spaces", [
    makeSpace({ id: "space-1", name: "Home" }),
    makeSpace({ id: "space-2", name: "Uni", color: "#ef4444" }),
  ]);
  mockCommandWith("list_relationships", (args) => {
    const id = args && "entityId" in args ? String(args.entityId) : "";
    return relationships[id] ?? [];
  });
  mockCommandWith("get_entity", (args) => {
    const id = args && "id" in args ? String(args.id) : "";
    if (id === "me") return me;
    return makeEntity({
      id,
      title: `Item ${id}`,
      type: "task",
      spaceId: id === "far" ? "space-2" : "space-1",
      deletedAt: id === "gone" ? "2026-02-01T00:00:00Z" : null,
    });
  });
  return renderWithProviders(
    <RelationshipGraphPanel entity={me} open onOpenChange={onOpenChange} />,
  );
}

const initialNav = useNavStore.getState();
beforeEach(() => useNavStore.setState(initialNav, true));

describe("RelationshipGraphPanel", () => {
  it("says so when the item has no relationships", async () => {
    setup({ me: [] });
    expect(await screen.findByText("No relationships yet")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Related items" })).toBeNull();
  });

  it("shows the direct links around the item, each with how it relates", async () => {
    setup({ me: [link("r1", "me", "a"), link("r2", "b", "me")] });
    const nodes = await screen.findByRole("list", { name: "Related items" });
    const a = await within(nodes).findByRole("button", { name: /Item a/ });
    expect(a).toHaveAccessibleName(/Blocks/);
    expect(within(nodes).getByRole("button", { name: /Item b/ })).toHaveAccessibleName(
      /Blocked by/,
    );
    expect(screen.getByText("Blocks")).toBeInTheDocument();
  });

  it("flags an item from another Space with that Space", async () => {
    setup({ me: [link("r1", "me", "far"), link("r2", "me", "near")] });
    const far = await screen.findByRole("button", { name: /Item far/ });
    expect(far).toHaveAccessibleName(/Uni/);
    expect(within(far).getByText("Uni")).toBeInTheDocument();
    const near = await screen.findByRole("button", { name: /Item near/ });
    expect(within(near).queryByText("Home")).toBeNull();
  });

  it("shows a trashed item dimmed instead of hiding it", async () => {
    setup({ me: [link("r1", "me", "gone")] });
    const node = await screen.findByRole("button", { name: /Item gone/ });
    expect(node).toHaveClass("opacity-50");
  });

  it("opens an item on click and closes the panel", async () => {
    let open = true;
    const { user } = setup({ me: [link("r1", "me", "a")] }, () => {
      open = false;
    });
    await user.click(await screen.findByRole("button", { name: /Item a/ }));
    const view = useNavStore.getState().view;
    expect(view).toMatchObject({ kind: "entity", entityId: "a" });
    expect(open).toBe(false);
  });

  it("opens an item in a new tab on Cmd+click and keeps the panel", async () => {
    let open = true;
    const { user } = setup({ me: [link("r1", "me", "a")] }, () => {
      open = false;
    });
    const before = useNavStore.getState().tabs.length;
    const node = await screen.findByRole("button", { name: /Item a/ });
    await user.keyboard("{Meta>}");
    await user.click(node);
    await user.keyboard("{/Meta}");
    expect(useNavStore.getState().tabs.length).toBe(before + 1);
    expect(useNavStore.getState().view).toMatchObject({ kind: "dashboard" });
    expect(open).toBe(true);
  });

  it("opens an item with Enter from the keyboard", async () => {
    const { user } = setup({ me: [link("r1", "me", "a")] });
    const node = await screen.findByRole("button", { name: /Item a/ });
    node.focus();
    await user.keyboard("{Enter}");
    expect(useNavStore.getState().view).toMatchObject({ kind: "entity", entityId: "a" });
  });

  it("adds the links of the direct links with the second ring", async () => {
    const { user } = setup({ me: [link("r1", "me", "a")], a: [link("r2", "a", "c")] });
    await screen.findByRole("button", { name: /Item a/ });
    expect(screen.queryByRole("button", { name: /Item c/ })).toBeNull();
    await user.click(screen.getByRole("switch", { name: "Second ring" }));
    expect(await screen.findByRole("button", { name: /Item c/ })).toBeInTheDocument();
  });

  it("says how many items it left out when a ring is full", async () => {
    const many = Array.from({ length: GRAPH_RING_CAP + 4 }, (_, i) => link(`r${i}`, "me", `x${i}`));
    setup({ me: many });
    expect(await screen.findByText(/4 more direct links not shown/)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /^Item x/ })).toHaveLength(GRAPH_RING_CAP),
    );
  });

  describe("zoom", () => {
    const zoomOf = async () => {
      const list = await screen.findByRole("list", { name: "Related items" });
      const scaled = list.closest<HTMLElement>("[style*='--graph-zoom']");
      return Number(scaled?.style.getPropertyValue("--graph-zoom"));
    };

    it("starts at the natural size", async () => {
      setup({ me: [link("r1", "me", "a")] });
      expect(await zoomOf()).toBe(1);
    });

    it("zooms out and back in with the zoom buttons", async () => {
      const { user } = setup({ me: [link("r1", "me", "a")] });
      await screen.findByRole("button", { name: /Item a/ });
      await user.click(screen.getByRole("button", { name: "Zoom Out" }));
      const out = await zoomOf();
      expect(out).toBeLessThan(1);
      await user.click(screen.getByRole("button", { name: "Zoom In" }));
      expect(await zoomOf()).toBeGreaterThan(out);
    });

    it("stops zooming out at the limit", async () => {
      const { user } = setup({ me: [link("r1", "me", "a")] });
      await screen.findByRole("button", { name: /Item a/ });
      const out = screen.getByRole("button", { name: "Zoom Out" });
      for (let i = 0; i < 12; i++) await user.click(out);
      expect(out).toBeDisabled();
      expect(await zoomOf()).toBeGreaterThan(0);
    });

    it("zooms with Ctrl and the mouse wheel", async () => {
      setup({ me: [link("r1", "me", "a")] });
      const list = await screen.findByRole("list", { name: "Related items" });
      const scroller = list.closest<HTMLElement>(".overflow-auto");
      if (!scroller) throw new Error("graph scroller not found");
      fireEvent.wheel(scroller, { deltaY: 100, ctrlKey: true });
      expect(await zoomOf()).toBeLessThan(1);
    });

    it("leaves a plain wheel scroll alone", async () => {
      setup({ me: [link("r1", "me", "a")] });
      const list = await screen.findByRole("list", { name: "Related items" });
      const scroller = list.closest<HTMLElement>(".overflow-auto");
      if (!scroller) throw new Error("graph scroller not found");
      fireEvent.wheel(scroller, { deltaY: 100 });
      expect(await zoomOf()).toBe(1);
    });

    it("brings the graph back to fit the view", async () => {
      const { user } = setup({ me: [link("r1", "me", "a")] });
      await screen.findByRole("button", { name: /Item a/ });
      await user.click(screen.getByRole("button", { name: "Zoom In" }));
      await user.click(screen.getByRole("button", { name: "Fit To View" }));
      expect(await zoomOf()).toBe(1);
    });

    it("fits everything again when the second ring grows the graph", async () => {
      const { user } = setup({ me: [link("r1", "me", "a")], a: [link("r2", "a", "c")] });
      await screen.findByRole("button", { name: /Item a/ });
      await user.click(screen.getByRole("button", { name: "Zoom In" }));
      await user.click(screen.getByRole("switch", { name: "Second ring" }));
      await screen.findByRole("button", { name: /Item c/ });
      expect(await zoomOf()).toBe(1);
    });
  });

  it("has no accessibility violations", async () => {
    setup({ me: [link("r1", "me", "a"), link("r2", "me", "far")] });
    await screen.findByRole("button", { name: /Item a/ });
    await expectNoA11yViolations();
  });
});
