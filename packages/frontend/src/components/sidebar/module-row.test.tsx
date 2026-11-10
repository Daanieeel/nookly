import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { SidebarProvider, SidebarMenu } from "@nookly/ui/components/sidebar";
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Space } from "#/lib/api/types.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { mockCommand } from "#/test/tauri.ts";
import { ModuleRow } from "./active-space-modules.tsx";

beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  mockCommand("list_views", []);
});

function setup() {
  // SAFETY: the row reads only the space id.
  const space = { id: "space-1" } as Space;
  return renderWithProviders(
    <SidebarProvider>
      <DndContext>
        <SortableContext items={["tasks"]}>
          <SidebarMenu>
            <ModuleRow space={space} moduleKey="tasks" active={false} onNavigate={() => {}} />
          </SidebarMenu>
        </SortableContext>
      </DndContext>
    </SidebarProvider>,
  );
}

// The row's item grows when its saved views open, so the drag handle and the
// chevron must sit on the title row's own height, never on the item's middle.
describe("module row handle and chevron", () => {
  it("stay on the title row, not the middle of the expanded item", async () => {
    const { user } = setup();
    const handle = screen.getByRole("button", { name: "Drag to reorder Tasks" });
    const chevron = screen.getByRole("button", { name: "Expand Tasks" });
    for (const el of [handle, chevron]) {
      expect(el).toHaveClass("top-4");
      expect(el).not.toHaveClass("top-1/2");
    }
    await user.click(chevron);
    expect(screen.getByRole("button", { name: "Collapse Tasks" })).toHaveClass("top-4");
    expect(handle).toHaveClass("top-4");
  });
});
