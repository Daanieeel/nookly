import { afterEach, describe, expect, it, vi } from "vitest";
import { makeEntity } from "#/test/fixtures.ts";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { shareFileName, sharePage } from "./share-page.ts";

const note = makeEntity({ id: "n1", type: "note", title: "Physics: week 3" });

interface ShareData {
  files?: File[];
  title?: string;
}

/// The Web Share API, which jsdom does not have.
function stubShare(share: (data: ShareData) => Promise<void>, canShare = true) {
  Object.defineProperty(navigator, "share", { value: share, configurable: true });
  Object.defineProperty(navigator, "canShare", { value: () => canShare, configurable: true });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "share");
  Reflect.deleteProperty(navigator, "canShare");
});

describe("shareFileName", () => {
  it("drops characters a file name cannot hold and adds the format's extension", () => {
    expect(shareFileName(note, "markdown")).toBe("Physics week 3.md");
    expect(shareFileName(note, "json")).toBe("Physics week 3.nookly.json");
    expect(shareFileName(makeEntity({ title: "" }), "markdown")).toBe("Untitled Task.md");
  });
});

describe("sharePage", () => {
  it("hands the file to the system share menu", async () => {
    const share = vi.fn(async (_data: ShareData) => {});
    stubShare(share);
    expect(await sharePage(note, "markdown", "# Physics")).toBe("shared");
    const data = share.mock.calls[0]?.[0];
    expect(data?.files?.[0]?.name).toBe("Physics week 3.md");
    expect(await data?.files?.[0]?.text()).toBe("# Physics");
  });

  it("reports a cancelled share without falling back", async () => {
    stubShare(async () => {
      throw new DOMException("cancelled", "AbortError");
    });
    mockCommand("plugin:dialog|save", "/tmp/x.md");
    expect(await sharePage(note, "markdown", "# Physics")).toBe("cancelled");
    expect(callsOf("plugin:dialog|save")).toHaveLength(0);
  });

  it("saves through the save dialog where the webview cannot share files", async () => {
    mockCommand("plugin:dialog|save", "/tmp/Physics week 3.md");
    mockCommand("render_page_markdown", "# Physics");
    mockCommand("export_page_markdown", null);
    expect(await sharePage(note, "markdown", "# Physics")).toBe("saved");
    expect(callsOf("export_page_markdown")[0]).toEqual({
      entityId: "n1",
      path: "/tmp/Physics week 3.md",
    });
  });

  it("also falls back when the share is refused, and for the Nookly page file", async () => {
    stubShare(async () => {
      throw new DOMException("no activation", "NotAllowedError");
    });
    mockCommand("plugin:dialog|save", "/tmp/Physics week 3.nookly.json");
    mockCommand("export_entity_json", null);
    expect(await sharePage(note, "json", "{}")).toBe("saved");
    expect(callsOf("export_entity_json")).toHaveLength(1);
  });

  it("is cancelled when the save dialog is", async () => {
    mockCommand("plugin:dialog|save", null);
    expect(await sharePage(note, "markdown", "# Physics")).toBe("cancelled");
  });

  it("falls back when the webview says it cannot share this file", async () => {
    stubShare(async () => {}, false);
    mockCommand("plugin:dialog|save", null);
    expect(await sharePage(note, "markdown", "x")).toBe("cancelled");
    expect(callsOf("plugin:dialog|save")).toHaveLength(1);
  });
});
