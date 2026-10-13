import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarMenu, SidebarProvider } from "@nookly/ui/components/sidebar";
import { preferences } from "#/lib/preferences.ts";
import { useSidebarHidden } from "#/lib/sidebar-items.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { mockCommand } from "#/test/tauri.ts";
import { SidebarCustomizeButton, SidebarTrashItem } from "./sidebar-items.tsx";

// jsdom has no matchMedia, which the sidebar uses to tell a phone from a desktop.
beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  preferences.remove(STORAGE_KEYS.sidebarHidden);
  useSidebarHidden.setState({ hidden: [] });
  mockCommand("list_spaces", []);
});

function setup() {
  return renderWithProviders(
    <SidebarProvider>
      <SidebarCustomizeButton />
      <SidebarMenu>
        <SidebarTrashItem />
      </SidebarMenu>
    </SidebarProvider>,
  );
}

// #123: the sidebar is crowded, so what is not used can be hidden.
describe("hiding Trash from the sidebar", () => {
  it("shows Trash by default", () => {
    setup();
    expect(screen.getByRole("button", { name: "Trash" })).toBeInTheDocument();
  });

  it("hides it from the customize menu, and brings it back", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Customize sidebar" }));
    await user.click(await screen.findByRole("button", { name: "Hide Trash" }));
    expect(screen.queryByRole("button", { name: "Trash" })).toBeNull();
    expect(preferences.get(STORAGE_KEYS.sidebarHidden)).toBe('["trash"]');
    await user.click(screen.getByRole("button", { name: "Show Trash" }));
    expect(screen.getByRole("button", { name: "Trash" })).toBeInTheDocument();
  });

  it("has no accessibility violations with the customize menu open", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Customize sidebar" }));
    await screen.findByRole("button", { name: "Hide Trash" });
    await expectNoA11yViolations();
  });

  it("starts hidden when it was hidden before", () => {
    useSidebarHidden.setState({ hidden: ["trash"] });
    setup();
    expect(screen.queryByRole("button", { name: "Trash" })).toBeNull();
  });
});
