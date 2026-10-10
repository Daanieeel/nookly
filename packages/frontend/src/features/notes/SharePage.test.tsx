import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntityActions } from "#/components/entity-actions.tsx";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { makeEntity } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, mockCommand } from "#/test/tauri.ts";

const note = makeEntity({ id: "note-1", type: "note", title: "Physics" });

interface ShareData {
  files?: File[];
}

function stubShare() {
  const share = vi.fn(async (_data: ShareData) => {});
  Object.defineProperty(navigator, "share", { value: share, configurable: true });
  Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
  return share;
}

function setup(entity = note, exportable = true) {
  mockCommand("render_page_markdown", "# Physics");
  mockCommand("render_entity_json", '{"format":"nookly-page"}');
  return renderWithProviders(
    <EntityActions
      entity={entity}
      exportable={exportable}
      pin={{ status: "idle", toggle: async () => {} }}
      onTrash={() => {}}
    />,
  );
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "share");
  Reflect.deleteProperty(navigator, "canShare");
});

describe("Share button", () => {
  it("offers Markdown and the Nookly page file in a popover", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Share Page" }));
    expect(await screen.findByRole("button", { name: /Markdown/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Nookly page/ })).toBeInTheDocument();
    await expectNoA11yViolations();
  });

  it("opens the system share menu with the markdown file", async () => {
    const share = stubShare();
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Share Page" }));
    const option = await screen.findByRole("button", { name: /Markdown/ });
    await waitFor(() => expect(option).toBeEnabled());
    await user.click(option);
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const file = share.mock.calls[0]?.[0].files?.[0];
    expect(file?.name).toBe("Physics.md");
    expect(await file?.text()).toBe("# Physics");
  });

  it("opens it with the Nookly page file", async () => {
    const share = stubShare();
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Share Page" }));
    const option = await screen.findByRole("button", { name: /Nookly page/ });
    await waitFor(() => expect(option).toBeEnabled());
    await user.click(option);
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(share.mock.calls[0]?.[0].files?.[0]?.name).toBe("Physics.nookly.json");
  });

  it("is only on pages", () => {
    setup(makeEntity({ id: "t1", type: "task" }), false);
    expect(screen.queryByRole("button", { name: "Share Page" })).toBeNull();
  });
});

describe("Share in the more actions menu", () => {
  it("has a Share submenu with both formats", async () => {
    const share = stubShare();
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Share" }));
    expect(await screen.findByRole("menuitem", { name: "Markdown" })).toBeInTheDocument();
    const item = await screen.findByRole("menuitem", { name: "Nookly page" });
    act(() => item.focus());
    await user.keyboard("{Enter}");
    await waitFor(() => expect(callsOf("render_entity_json").length).toBeGreaterThan(0));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
  });

  it("has no Share for what is not a page", async () => {
    const { user } = setup(makeEntity({ id: "t1", type: "task" }), false);
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await screen.findByRole("menuitem", { name: /Pin/ });
    expect(screen.queryByRole("menuitem", { name: "Share" })).toBeNull();
  });

  it("spaces the Share icon from its label like every other menu item", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "More actions" }));
    const share = await screen.findByRole("menuitem", { name: "Share" });
    const pin = await screen.findByRole("menuitem", { name: /Pin/ });
    expect(share).toHaveClass("gap-2");
    expect(pin).toHaveClass("gap-2");
  });
});
