import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { localPath } from "./local-path.ts";

beforeEach(() => {
  mockIPC((cmd) => (cmd === "plugin:path|resolve_directory" ? "/Users/me" : undefined));
});
afterEach(() => clearMocks());

describe("localPath", () => {
  it("keeps an absolute path", async () => {
    expect(await localPath("/Users/me/a.pdf")).toBe("/Users/me/a.pdf");
  });
  it("drops wrapping quotes and shell escapes", async () => {
    expect(await localPath("'/Users/me/My File.pdf'")).toBe("/Users/me/My File.pdf");
    expect(await localPath("/Users/me/My\\ File.pdf")).toBe("/Users/me/My File.pdf");
  });
  it("reads a file URL", async () => {
    expect(await localPath("file:///Users/me/My%20File.pdf")).toBe("/Users/me/My File.pdf");
  });
  it("is null for a link or a bare name", async () => {
    expect(await localPath("https://example.com/a.pdf")).toBeNull();
    expect(await localPath("a.pdf")).toBeNull();
  });
});
