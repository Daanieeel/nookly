import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeEntity, makeFile } from "#/test/fixtures.ts";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import {
  installTauriMock,
  mockCommand,
  mockCommandWith,
  uninstallTauriMock,
} from "#/test/tauri.ts";
import type { CardBlock } from "#/lib/api/types.ts";
import { CardFaceView } from "./CardFaceView.tsx";

declare global {
  interface Window {
    /// What Tauri's IPC mock leaves on the window; the real one also has `convertFileSrc`.
    __TAURI_INTERNALS__: { convertFileSrc?: (path: string) => string };
  }
}

const picture: CardBlock = { type: "image", content: "[cell.png](mention:f1)" };

beforeEach(() => {
  installTauriMock();
  window.__TAURI_INTERNALS__.convertFileSrc = (path: string) => `asset://localhost${path}`;
  mockCommand("list_entities", []);
  mockCommand(
    "get_file",
    makeFile({ localPath: "/data/files/cell.png" }, { id: "f1", title: "cell.png" }),
  );
  mockCommand("get_entity", makeEntity({ id: "f1", type: "file", title: "cell.png" }));
});
afterEach(uninstallTauriMock);

describe("CardFaceView", () => {
  it("draws text and formulas of a face", async () => {
    renderWithProviders(
      <CardFaceView
        spaceId="s1"
        side="front"
        blocks={[
          { type: "paragraph", content: "What is **ATP**?" },
          { type: "equation", content: "E = mc^2" },
        ]}
      />,
    );
    expect((await screen.findByText("ATP")).tagName).toBe("STRONG");
    await waitFor(() => expect(document.querySelector(".katex")).not.toBeNull());
  });

  it("opens a picture larger on a click, without turning the card", async () => {
    const turned = vi.fn();
    const { user } = renderWithProviders(
      // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- stands in for the study card
      <div onClick={turned}>
        <CardFaceView spaceId="s1" side="front" blocks={[picture]} />
      </div>,
    );
    fireEvent.click(await screen.findByRole("img", { name: "cell.png" }));
    const dialog = await screen.findByRole("dialog", { name: "cell.png" });
    expect(dialog.querySelector("img")?.getAttribute("src")).toBe(
      "asset://localhost/data/files/cell.png",
    );
    expect(turned).not.toHaveBeenCalled();
    await expectNoA11yViolations();

    // A click inside the dialog is not a click on the card either, and Escape closes it.
    fireEvent.click(dialog);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(turned).not.toHaveBeenCalled();
  });

  it("shows the same missing state as a note when the picture's File is gone", async () => {
    mockCommandWith("get_file", () => {
      throw new Error("file not found");
    });
    renderWithProviders(<CardFaceView spaceId="s1" side="back" blocks={[picture]} />);
    expect(await screen.findByText("This file no longer exists.")).toBeInTheDocument();
  });
});
