import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useNavStore } from "#/lib/store/nav.ts";
import { makeEntity } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, installTauriMock, mockCommand, uninstallTauriMock } from "#/test/tauri.ts";
import { EXPANDABLE_MODULE_KEYS, ExpandableModuleChildren } from "./expandable-module-children";

beforeEach(installTauriMock);
afterEach(uninstallTauriMock);

describe("saved Views under a sidebar row", () => {
  it("lists the Views of Notes and Jots like those of Tasks", async () => {
    expect([...EXPANDABLE_MODULE_KEYS]).toEqual(
      expect.arrayContaining(["tasks", "assignments", "notes", "jots"]),
    );
    mockCommand("list_views", [
      {
        entity: makeEntity({ id: "v1", type: "view", title: "Lectures", spaceId: "s1" }),
        module: "notes",
        config: "{}",
        position: 0,
      },
    ]);
    const { user } = renderWithProviders(
      <ExpandableModuleChildren moduleKey="notes" spaceId="s1" open />,
    );
    await user.click(await screen.findByText("Lectures"));
    expect(callsOf("list_views")[0]).toMatchObject({ module: "notes" });
    expect(useNavStore.getState().view).toMatchObject({
      kind: "module",
      module: "notes",
      viewId: "v1",
    });
  });
});
