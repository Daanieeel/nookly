import { beforeEach, describe, expect, it, vi } from "vitest";
import { FALLBACK_RELEASE, fetchLatestRelease, parseRelease } from "./releases";

const asset = (name: string, size = 1) => ({
  name,
  size,
  browser_download_url: `https://github.com/x/releases/download/v0.75.3/${name}`,
});

describe("parseRelease", () => {
  it("sorts the release's assets into installers by their names", () => {
    const release = parseRelease({
      tag_name: "v0.75.3",
      published_at: "2026-11-17T09:29:05Z",
      html_url: "https://github.com/x/releases/tag/v0.75.3",
      assets: [
        asset("latest.json"),
        asset("Nookly-0.75.3-1.x86_64.rpm"),
        asset("Nookly-0.75.3-1.x86_64.rpm.sig"),
        asset("Nookly_0.75.3_aarch64.app.tar.gz"),
        asset("Nookly_0.75.3_aarch64.dmg", 18_000_000),
        asset("Nookly_0.75.3_amd64.AppImage"),
        asset("Nookly_0.75.3_amd64.deb"),
        asset("Nookly_0.75.3_x64-setup.exe"),
        asset("Nookly_0.75.3_x64-setup.exe.sig"),
        asset("Nookly_0.75.3_x64.dmg"),
        asset("Nookly_0.75.3_x64_en-US.msi"),
        asset("SHA256SUMS"),
        asset("SHA256SUMS.asc"),
      ],
    });
    expect(release.version).toBe("0.75.3");
    expect(release.downloads.map((d) => [d.id, d.file])).toEqual([
      ["mac-arm", "Nookly_0.75.3_aarch64.dmg"],
      ["mac-intel", "Nookly_0.75.3_x64.dmg"],
      ["windows-exe", "Nookly_0.75.3_x64-setup.exe"],
      ["windows-msi", "Nookly_0.75.3_x64_en-US.msi"],
      ["linux-appimage", "Nookly_0.75.3_amd64.AppImage"],
      ["linux-deb", "Nookly_0.75.3_amd64.deb"],
      ["linux-rpm", "Nookly-0.75.3-1.x86_64.rpm"],
    ]);
    expect(release.downloads[0].size).toBe(18_000_000);
    expect(release.checksums?.signature).toMatch(/SHA256SUMS\.asc$/);
  });

  it("leaves out an installer the release doesn't have", () => {
    const release = parseRelease({
      tag_name: "v1.0.0",
      published_at: null,
      html_url: "",
      assets: [asset("Nookly_1.0.0_aarch64.dmg")],
    });
    expect(release.downloads.map((d) => d.id)).toEqual(["mac-arm"]);
    expect(release.checksums).toBeNull();
  });
});

const githubAnswer = {
  tag_name: "v1.0.0",
  published_at: "2026-11-23T22:15:30Z",
  html_url: "https://github.com/x/releases/tag/v1.0.0",
  assets: [asset("Nookly_1.0.0_aarch64.dmg", 18_000_000), asset("SHA256SUMS")],
};

describe("fetchLatestRelease", () => {
  beforeEach(() => sessionStorage.clear());

  it("reads the latest release from GitHub in the browser", async () => {
    const fetchMock = vi.fn(async (_url: string) => Response.json(githubAnswer));
    vi.stubGlobal("fetch", fetchMock);
    const release = await fetchLatestRelease();
    expect(release.version).toBe("1.0.0");
    expect(release.downloads.map((d) => d.id)).toEqual(["mac-arm"]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/\/releases\/latest$/);
  });

  it("asks GitHub once per visit, so a page that reloads stays under its rate limit", async () => {
    const fetchMock = vi.fn(async () => Response.json(githubAnswer));
    vi.stubGlobal("fetch", fetchMock);
    await fetchLatestRelease();
    const again = await fetchLatestRelease();
    expect(again.version).toBe("1.0.0");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the releases page when GitHub does not answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 403 })),
    );
    expect(await fetchLatestRelease()).toEqual(FALLBACK_RELEASE);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("offline"))),
    );
    expect(await fetchLatestRelease()).toEqual(FALLBACK_RELEASE);
  });

  it("falls back when the answer is not a release", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ message: "nope" })),
    );
    expect(await fetchLatestRelease()).toEqual(FALLBACK_RELEASE);
  });
});

describe("FALLBACK_RELEASE", () => {
  it("names no version, so a page built without GitHub never shows a stale one", () => {
    expect(FALLBACK_RELEASE.version).toBeNull();
    expect(FALLBACK_RELEASE.downloads.every((d) => d.url.endsWith("/releases/latest"))).toBe(true);
  });
});
