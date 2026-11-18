import { describe, expect, it } from "vitest";
import { parseRelease } from "./releases";

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
      draft: false,
      prerelease: false,
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
      draft: false,
      prerelease: false,
      assets: [asset("Nookly_1.0.0_aarch64.dmg")],
    });
    expect(release.downloads.map((d) => d.id)).toEqual(["mac-arm"]);
    expect(release.checksums).toBeNull();
  });
});
