import { act, fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ContextMenuHost } from "#/components/context-menu/context-menu-host.tsx";
import { tabGroups, useNavStore } from "#/lib/store/nav.ts";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { SplitView, fitsSplit } from "./split-view.tsx";
import { TabBar, useTabInteractions } from "./tab-bar.tsx";
import { useTabGroupScope } from "./tab-group-scope.ts";
import "./tab-actions.tsx";

const initial = useNavStore.getState();

beforeEach(() => {
  useNavStore.setState(initial, true);
});

function ViewName() {
  const { view, focused } = useTabGroupScope();
  return <p>{`${view.kind}${focused ? " (focused)" : ""}`}</p>;
}

function Harness() {
  useTabInteractions();
  return (
    <>
      <SplitView renderGroup={() => <ViewName />} />
      <ContextMenuHost />
    </>
  );
}

const groups = () => tabGroups(useNavStore.getState());

function splitWithTrashOnTheRight() {
  act(() => {
    useNavStore.getState().splitRight();
    useNavStore.getState().setView({ kind: "trash" });
  });
}

describe("split view", () => {
  it("shows one group like before, with no landmarks or divider", () => {
    renderWithProviders(<Harness />);
    expect(screen.getByText("dashboard (focused)")).toBeInTheDocument();
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.queryByRole("separator")).toBeNull();
  });

  it("renders each group's own view in its own landmark", () => {
    renderWithProviders(<Harness />);
    splitWithTrashOnTheRight();
    const left = screen.getByRole("region", { name: "Left Group" });
    const right = screen.getByRole("region", { name: "Right Group" });
    expect(within(left).getByText("dashboard")).toBeInTheDocument();
    expect(within(right).getByText("trash (focused)")).toBeInTheDocument();
  });

  it("focuses the group pressed in", () => {
    renderWithProviders(<Harness />);
    splitWithTrashOnTheRight();
    fireEvent.pointerDown(screen.getByText("dashboard"));
    expect(useNavStore.getState().focusedGroupId).toBe(groups()[0].id);
    expect(useNavStore.getState().view).toEqual({ kind: "dashboard" });
  });

  it("resizes with the arrow keys and resets on double click", () => {
    renderWithProviders(<Harness />);
    splitWithTrashOnTheRight();
    const divider = screen.getByRole("separator", { name: "Resize Groups" });
    expect(divider).toHaveAttribute("aria-valuenow", "50");
    fireEvent.keyDown(divider, { key: "ArrowRight" });
    expect(useNavStore.getState().splitRatio).toBeCloseTo(0.52);
    fireEvent.keyDown(divider, { key: "End" });
    expect(divider).toHaveAttribute("aria-valuenow", "80");
    fireEvent.keyDown(divider, { key: "Home" });
    expect(useNavStore.getState().splitRatio).toBe(0.2);
    fireEvent.doubleClick(divider);
    expect(useNavStore.getState().splitRatio).toBe(0.5);
  });

  it("gives each group's tab bar room above and below, even with the sidebar collapsed", () => {
    renderWithProviders(<Harness />);
    splitWithTrashOnTheRight();
    for (const name of ["Left Group Tabs", "Right Group Tabs"]) {
      const bar = screen.getByRole("tablist", { name }).parentElement;
      expect(bar?.className).toMatch(/collapsed\]\]\/app:pt-1/);
    }
  });

  it("keeps the outer edge of each group's tab bar off the window edge with the sidebar collapsed", () => {
    renderWithProviders(<Harness />);
    splitWithTrashOnTheRight();
    const left = screen.getByRole("tablist", { name: "Left Group Tabs" }).parentElement;
    const right = screen.getByRole("tablist", { name: "Right Group Tabs" }).parentElement;
    expect(left?.className).toMatch(/collapsed\]\]\/app:pl-1/);
    expect(right?.className).toMatch(/collapsed\]\]\/app:pr-1/);
  });

  it("shows only the focused group while zoomed, and both again after", () => {
    renderWithProviders(<Harness />);
    splitWithTrashOnTheRight();
    act(() => useNavStore.getState().toggleGroupZoom());
    expect(screen.queryByRole("region", { name: "Left Group" })).toBeNull();
    expect(screen.queryByRole("separator")).toBeNull();
    expect(screen.getByText("trash (focused)")).toBeInTheDocument();
    act(() => useNavStore.getState().toggleGroupZoom());
    expect(screen.getByRole("region", { name: "Left Group" })).toBeInTheDocument();
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  it("has no axe violations while split", async () => {
    renderWithProviders(<Harness />);
    splitWithTrashOnTheRight();
    await expectNoA11yViolations();
  });

  it("collapses to the focused group in a narrow window", () => {
    expect(fitsSplit(1200)).toBe(true);
    expect(fitsSplit(600)).toBe(false);
  });
});

describe("split view shortcuts", () => {
  it("splits right and focuses either group", async () => {
    const { user } = renderWithProviders(<Harness />);
    await user.keyboard("{Control>}{Alt>}{Shift>}{ArrowRight}{/Shift}{/Alt}{/Control}");
    expect(groups()).toHaveLength(2);
    expect(useNavStore.getState().focusedGroupId).toBe(groups()[1].id);
    await user.keyboard("{Control>}1{/Control}");
    expect(useNavStore.getState().focusedGroupId).toBe(groups()[0].id);
    await user.keyboard("{Control>}2{/Control}");
    expect(useNavStore.getState().focusedGroupId).toBe(groups()[1].id);
  });

  it("splits left with keys that exist on a German keyboard", async () => {
    const { user } = renderWithProviders(<Harness />);
    await user.keyboard("{Control>}{Alt>}{Shift>}{ArrowLeft}{/Shift}{/Alt}{/Control}");
    expect(groups()).toHaveLength(2);
    expect(useNavStore.getState().focusedGroupId).toBe(groups()[0].id);
  });

  it("zooms the focused group with Mod+Shift+Enter and brings the other back", async () => {
    const { user } = renderWithProviders(<Harness />);
    splitWithTrashOnTheRight();
    await user.keyboard("{Control>}{Shift>}{Enter}{/Shift}{/Control}");
    expect(useNavStore.getState().groupZoomed).toBe(true);
    await user.keyboard("{Control>}{Shift>}{Enter}{/Shift}{/Control}");
    expect(useNavStore.getState().groupZoomed).toBe(false);
  });

  it("opens a new tab in the focused group", async () => {
    const { user } = renderWithProviders(<Harness />);
    splitWithTrashOnTheRight();
    await user.keyboard("{Control>}t{/Control}");
    expect(groups().map((g) => g.tabs.length)).toEqual([1, 2]);
  });
});

describe("the tab menu", () => {
  function TabMenuHarness() {
    return (
      <>
        <TabBar groupId={useNavStore.getState().focusedGroupId} />
        <ContextMenuHost />
      </>
    );
  }

  it("splits a tab to the right", async () => {
    const { user } = renderWithProviders(<TabMenuHarness />);
    fireEvent.contextMenu(screen.getByRole("tab"));
    await user.click(await screen.findByRole("menuitem", { name: /Split Right/ }));
    expect(groups()).toHaveLength(2);
  });

  it("moves a tab to the other group, the keyboard way to drag it there", async () => {
    act(() => useNavStore.getState().openInNewTab({ kind: "trash" }));
    const { user } = renderWithProviders(<TabMenuHarness />);
    fireEvent.contextMenu(screen.getAllByRole("tab")[1]);
    await user.click(await screen.findByRole("menuitem", { name: /Move to Right Group/ }));
    expect(groups().map((g) => g.tabs.map((t) => t.view.kind))).toEqual([["dashboard"], ["trash"]]);
  });

  it("offers Zoom Group only while split, and Show Both Groups once zoomed", async () => {
    const { user } = renderWithProviders(<TabMenuHarness />);
    fireEvent.contextMenu(screen.getByRole("tab"));
    expect(await screen.findByRole("menuitem", { name: /Split Right/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Zoom Group/ })).toBeNull();
    await user.keyboard("{Escape}");
    act(() => useNavStore.getState().splitRight());
    fireEvent.contextMenu(screen.getAllByRole("tab")[0]);
    await user.click(await screen.findByRole("menuitem", { name: /Zoom Group/ }));
    expect(useNavStore.getState().groupZoomed).toBe(true);
    fireEvent.contextMenu(screen.getAllByRole("tab")[0]);
    await user.click(await screen.findByRole("menuitem", { name: /Show Both Groups/ }));
    expect(useNavStore.getState().groupZoomed).toBe(false);
  });

  it("has no axe violations with the split items open", async () => {
    renderWithProviders(<TabMenuHarness />);
    fireEvent.contextMenu(screen.getByRole("tab"));
    await screen.findByRole("menuitem", { name: /Split Right/ });
    await expectNoA11yViolations();
  });
});
