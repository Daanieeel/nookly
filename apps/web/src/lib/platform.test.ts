import { describe, expect, it } from "vitest";
import { detectPlatform } from "./platform";

const UA = {
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15",
  windowsChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0 Safari/537.36",
  ubuntuFirefox: "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0",
  fedoraFirefox: "Mozilla/5.0 (X11; Fedora; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0",
  linuxChrome:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0 Safari/537.36",
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1",
  android:
    "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0 Mobile Safari/537.36",
};

describe("detectPlatform", () => {
  it("gives a Mac Apple silicon unless the browser says Intel", () => {
    expect(detectPlatform({ userAgent: UA.macSafari })).toEqual({ kind: "desktop", id: "mac-arm" });
    expect(
      detectPlatform({ userAgent: UA.macSafari, platform: "macOS", architecture: "x86" }),
    ).toEqual({ kind: "desktop", id: "mac-intel" });
  });

  it("tells an iPad, which says Macintosh, from a Mac by its touch points", () => {
    expect(detectPlatform({ userAgent: UA.macSafari, maxTouchPoints: 5 })).toEqual({ kind: "ios" });
    expect(detectPlatform({ userAgent: UA.iphone })).toEqual({ kind: "ios" });
  });

  it("gives Windows the setup program", () => {
    expect(detectPlatform({ userAgent: UA.windowsChrome })).toEqual({
      kind: "desktop",
      id: "windows-exe",
    });
  });

  it("gives Linux the package its distribution uses, else the AppImage", () => {
    expect(detectPlatform({ userAgent: UA.ubuntuFirefox })).toEqual({
      kind: "desktop",
      id: "linux-deb",
    });
    expect(detectPlatform({ userAgent: UA.fedoraFirefox })).toEqual({
      kind: "desktop",
      id: "linux-rpm",
    });
    expect(detectPlatform({ userAgent: UA.linuxChrome })).toEqual({
      kind: "desktop",
      id: "linux-appimage",
    });
  });

  it("knows Android before Linux, and admits when it can't tell", () => {
    expect(detectPlatform({ userAgent: UA.android })).toEqual({ kind: "android" });
    expect(detectPlatform({ userAgent: "curl/8.9" })).toEqual({ kind: "unknown" });
  });
});
