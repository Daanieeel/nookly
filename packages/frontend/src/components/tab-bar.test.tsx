import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNavStore } from "#/lib/store/nav.ts";
import { makeEntity } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { mockCommand } from "#/test/tauri.ts";
import { TabBar } from "./tab-bar.tsx";

const initial = useNavStore.getState();

beforeEach(() => {
  useNavStore.setState(initial, true);
  mockCommand("list_spaces", []);
});

describe("TabBar", () => {
  it("shows the key of the entity a tab has open, before its title", async () => {
    mockCommand("get_entity", makeEntity({ id: "t1", type: "task", title: "Read", key: "TSK-14" }));
    renderWithProviders(<TabBar groupId={useNavStore.getState().focusedGroupId} />);
    act(() => useNavStore.getState().openEntity("t1", "space-1"));

    const tab = await screen.findByRole("tab", { name: /Read/ });
    expect(tab).toHaveTextContent("TSK-14");
    expect(tab.textContent?.indexOf("TSK-14")).toBeLessThan(tab.textContent?.indexOf("Read") ?? 0);
  });

  it("shows no key on a tab that is not an entity", () => {
    renderWithProviders(<TabBar groupId={useNavStore.getState().focusedGroupId} />);
    expect(screen.getByRole("tab", { name: "Dashboard" })).toHaveTextContent(/^Dashboard$/);
  });

  // WebKitGTK (Linux) cancels a native drag that carries no data, and a drop target that does
  // not announce an effect, so tabs could not be reordered there.
  it("hands the webview data and a move effect when a tab is dragged", () => {
    renderWithProviders(<TabBar groupId={useNavStore.getState().focusedGroupId} />);
    const tab = screen.getByRole("tab", { name: "Dashboard" }).closest<HTMLElement>("[data-tab]");
    if (!tab) throw new Error("tab not found");
    const dataTransfer = { setData: vi.fn(), effectAllowed: "uninitialized", dropEffect: "none" };

    fireEvent.dragStart(tab, { dataTransfer });
    expect(dataTransfer.setData).toHaveBeenCalledWith("text/plain", expect.any(String));
    expect(dataTransfer.effectAllowed).toBe("move");

    fireEvent.dragOver(tab, { dataTransfer });
    expect(dataTransfer.dropEffect).toBe("move");
  });
});
