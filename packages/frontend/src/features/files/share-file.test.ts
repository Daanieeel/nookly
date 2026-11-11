import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFile } from "#/test/fixtures.ts";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { MAX_SHARE_BYTES, readFileForShare, shareFile } from "./share-file.ts";

const file = makeFile(
  { localPath: "/files/notes.pdf", originalFilename: "notes.pdf" },
  { id: "f1", title: "Lecture notes" },
);

interface ShareData {
  files?: File[];
  title?: string;
}

/// The Web Share API, which jsdom does not have.
function stubShare(share: (data: ShareData) => Promise<void>, canShare = true) {
  Object.defineProperty(navigator, "share", {
    value: share,
    configurable: true,
  });
  Object.defineProperty(navigator, "canShare", {
    value: () => canShare,
    configurable: true,
  });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "share");
  Reflect.deleteProperty(navigator, "canShare");
  vi.unstubAllGlobals();
});

describe("readFileForShare", () => {
  it("reads the file", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("pdf bytes", {
            headers: { "content-type": "text/plain" },
          }),
      ),
    );
    const blob = await readFileForShare("asset://x");
    expect(await blob?.text()).toBe("pdf bytes");
  });

  it("leaves a file too big to hold in memory unread", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("x", {
            headers: { "content-length": String(MAX_SHARE_BYTES + 1) },
          }),
      ),
    );
    expect(await readFileForShare("asset://x")).toBeNull();
  });
});

describe("shareFile", () => {
  it("hands the file to the system share menu under its own name", async () => {
    const share = vi.fn(async (_data: ShareData) => {});
    stubShare(share);
    expect(await shareFile(file, new Blob(["pdf bytes"]))).toBe("shared");
    const data = share.mock.calls[0]?.[0];
    expect(data?.files?.[0]?.name).toBe("notes.pdf");
    expect(await data?.files?.[0]?.text()).toBe("pdf bytes");
    expect(data?.title).toBe("Lecture notes");
  });

  it("reports a cancelled share without falling back", async () => {
    stubShare(async () => {
      throw new DOMException("cancelled", "AbortError");
    });
    mockCommand("plugin:dialog|save", "/tmp/notes.pdf");
    expect(await shareFile(file, new Blob(["x"]))).toBe("cancelled");
    expect(callsOf("plugin:dialog|save")).toHaveLength(0);
  });

  it("saves a copy where the webview cannot share files", async () => {
    mockCommand("plugin:dialog|save", "/tmp/notes.pdf");
    mockCommand("export_file", null);
    expect(await shareFile(file, new Blob(["x"]))).toBe("saved");
    expect(callsOf("export_file")[0]).toEqual({
      entityId: "f1",
      destination: "/tmp/notes.pdf",
    });
  });

  it("also falls back when the share is refused", async () => {
    stubShare(async () => {
      throw new DOMException("no activation", "NotAllowedError");
    });
    mockCommand("plugin:dialog|save", "/tmp/notes.pdf");
    mockCommand("export_file", null);
    expect(await shareFile(file, new Blob(["x"]))).toBe("saved");
  });

  it("saves a copy of a file that was too big to read", async () => {
    const share = vi.fn(async (_data: ShareData) => {});
    stubShare(share);
    mockCommand("plugin:dialog|save", "/tmp/notes.pdf");
    mockCommand("export_file", null);
    expect(await shareFile(file, null)).toBe("saved");
    expect(share).not.toHaveBeenCalled();
  });

  it("is cancelled when the save dialog is", async () => {
    mockCommand("plugin:dialog|save", null);
    expect(await shareFile(file, new Blob(["x"]))).toBe("cancelled");
    expect(callsOf("export_file")).toHaveLength(0);
  });
});
