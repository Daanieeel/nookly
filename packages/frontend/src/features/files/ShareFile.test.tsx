import { mockConvertFileSrc } from "@tauri-apps/api/mocks";
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntityActions } from "#/components/entity-actions.tsx";
import { makeFile } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { mockCommand } from "#/test/tauri.ts";

const stored = makeFile(
  { localPath: "/files/notes.pdf", originalFilename: "notes.pdf" },
  { id: "f1", title: "Lecture notes" },
);

interface ShareData {
  files?: File[];
}

function stubShare(share: (data: ShareData) => Promise<void>) {
  Object.defineProperty(navigator, "share", {
    value: share,
    configurable: true,
  });
  Object.defineProperty(navigator, "canShare", {
    value: () => true,
    configurable: true,
  });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "share");
  Reflect.deleteProperty(navigator, "canShare");
  vi.unstubAllGlobals();
});

function setup(file = stored) {
  mockCommand("get_file", file);
  // The IPC mock has no asset protocol.
  mockConvertFileSrc("macos");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("pdf bytes")),
  );
  return renderWithProviders(
    <EntityActions
      entity={file.entity}
      exportable={false}
      pin={{ status: "idle", toggle: async () => {} }}
      onTrash={() => {}}
    />,
  );
}

describe("sharing a File", () => {
  it("has a Share File button in the details sidebar that shares the file itself", async () => {
    const share = vi.fn(async (_data: ShareData) => {});
    stubShare(share);
    const { user } = setup();

    const button = await screen.findByRole("button", { name: "Share File" });
    await vi.waitFor(() => expect(button).toBeEnabled());
    await user.click(button);

    await vi.waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(share.mock.calls[0]?.[0].files?.[0]?.name).toBe("notes.pdf");
  });

  it("also has Share in the more actions menu", async () => {
    const share = vi.fn(async (_data: ShareData) => {});
    stubShare(share);
    const { user } = setup();
    await screen.findByRole("button", { name: "Share File" });

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Share" }));

    await vi.waitFor(() => expect(share).toHaveBeenCalledTimes(1));
  });

  it("is not offered for a link with no file behind it", async () => {
    setup(makeFile({ url: "https://example.com/a.pdf" }, { id: "f2" }));
    await screen.findByRole("button", { name: "More actions" });
    await vi.waitFor(() => expect(screen.queryByRole("button", { name: "Share File" })).toBeNull());
  });

  it("is not offered for other types", () => {
    mockCommand("get_file", stored);
    renderWithProviders(
      <EntityActions
        entity={{ ...stored.entity, type: "task" }}
        exportable={false}
        pin={{ status: "idle", toggle: async () => {} }}
        onTrash={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: "Share File" })).toBeNull();
  });
});
