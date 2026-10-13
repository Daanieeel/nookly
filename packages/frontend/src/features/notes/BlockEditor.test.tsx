import { act, waitFor } from "@testing-library/react";
import { TabGroupContext } from "#/components/tab-group-scope.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderWithProviders } from "#/test/render.tsx";
import { installTauriMock, mockCommand, uninstallTauriMock } from "#/test/tauri.ts";
import { BlockEditor } from "./BlockEditor";

const initialNav = useNavStore.getState();

/// The editor mounts once the page's blocks have loaded.
async function findEditor(container: HTMLElement) {
  await waitFor(() => expect(container.querySelector(".tiptap-content")).not.toBeNull());
  return container.querySelector(".tiptap-content")!;
}

describe("the block editor's scroll room", () => {
  beforeEach(() => {
    installTauriMock();
    mockCommand("list_blocks", []);
  });
  afterEach(uninstallTauriMock);

  it("leaves a screen of room below the last block when asked, for a full page", async () => {
    const { container } = renderWithProviders(
      <BlockEditor entityId="e1" spaceId="s1" scrollPastEnd />,
    );
    const content = await findEditor(container);
    expect(content.getAttribute("style")).toContain("padding-bottom: 100vh");
  });

  it("adds none by default, so content below an inline editor sits right under it", async () => {
    const { container } = renderWithProviders(<BlockEditor entityId="e1" spaceId="s1" />);
    const content = await findEditor(container);
    expect(content.getAttribute("style") ?? "").not.toContain("padding-bottom");
  });

  it("adds none to a compact editor embedded in another page", async () => {
    const { container } = renderWithProviders(<BlockEditor entityId="e1" spaceId="s1" compact />);
    const content = await findEditor(container);
    expect(content.getAttribute("style") ?? "").not.toContain("padding-bottom");
  });
});

describe("the same page open in both groups of a split", () => {
  beforeEach(() => {
    installTauriMock();
    mockCommand("list_blocks", []);
  });
  afterEach(() => {
    uninstallTauriMock();
    useNavStore.setState({ focusedGroupId: initialNav.focusedGroupId });
  });

  function InGroup({ groupId }: { groupId: string }) {
    return (
      <TabGroupContext.Provider
        value={{ groupId, tabId: groupId, view: { kind: "dashboard" }, focused: false }}
      >
        <div data-testid={groupId}>
          <BlockEditor entityId="e1" spaceId="s1" />
        </div>
      </TabGroupContext.Provider>
    );
  }

  it("lets only the focused group's copy be edited, and hands over on focus", async () => {
    useNavStore.setState({ focusedGroupId: "R" });
    const { getByTestId } = renderWithProviders(
      <>
        <InGroup groupId="L" />
        <InGroup groupId="R" />
      </>,
    );
    const left = await findEditor(getByTestId("L"));
    const right = await findEditor(getByTestId("R"));
    await waitFor(() => expect(left.getAttribute("contenteditable")).toBe("false"));
    expect(right.getAttribute("contenteditable")).toBe("true");
    act(() => useNavStore.setState({ focusedGroupId: "L" }));
    await waitFor(() => expect(left.getAttribute("contenteditable")).toBe("true"));
    expect(right.getAttribute("contenteditable")).toBe("false");
  });
});
