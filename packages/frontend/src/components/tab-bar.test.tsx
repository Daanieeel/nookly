import { act, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
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
});
