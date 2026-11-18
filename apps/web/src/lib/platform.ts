import type { DownloadId } from "./releases";

export type Detected =
  | { kind: "desktop"; id: DownloadId }
  | { kind: "ios" }
  | { kind: "android" }
  | { kind: "unknown" };

export type PlatformHints = {
  userAgent: string;
  /// `navigator.userAgentData.platform` where the browser has it (Chromium).
  platform?: string;
  /// `navigator.userAgentData` high entropy `architecture`: "arm" or "x86".
  architecture?: string;
  /// Touch points, to tell an iPad (which says "Macintosh") from a Mac.
  maxTouchPoints?: number;
};

/// The installer that fits the visitor's computer. Safari and Firefox on a Mac don't say
/// which chip it has, so a Mac gets Apple silicon unless the browser says Intel: every
/// Mac sold since 2023 has it, and the menu offers Intel next to it.
export function detectPlatform(hints: PlatformHints): Detected {
  const ua = hints.userAgent;
  const platform = (hints.platform ?? "").toLowerCase();
  const touch = hints.maxTouchPoints ?? 0;

  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && touch > 1)) {
    return { kind: "ios" };
  }
  if (/android/i.test(ua)) return { kind: "android" };
  if (platform === "macos" || /mac os x|macintosh/i.test(ua)) {
    return { kind: "desktop", id: hints.architecture === "x86" ? "mac-intel" : "mac-arm" };
  }
  if (platform === "windows" || /windows/i.test(ua)) {
    return { kind: "desktop", id: "windows-exe" };
  }
  if (/fedora|red hat|centos|suse/i.test(ua)) return { kind: "desktop", id: "linux-rpm" };
  if (/ubuntu|debian|mint/i.test(ua)) return { kind: "desktop", id: "linux-deb" };
  if (platform === "linux" || platform === "chrome os" || /linux|cros/i.test(ua)) {
    return { kind: "desktop", id: "linux-appimage" };
  }
  return { kind: "unknown" };
}

type UserAgentData = {
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }>;
};

/// Reads the hints from the browser. Never throws: a browser that hides them still gets
/// an answer from its user agent string.
export async function browserHints(): Promise<PlatformHints> {
  const nav = navigator as Navigator & { userAgentData?: UserAgentData };
  const data = nav.userAgentData;
  let architecture: string | undefined;
  try {
    architecture = (await data?.getHighEntropyValues?.(["architecture"]))?.architecture;
  } catch {
    architecture = undefined;
  }
  return {
    userAgent: nav.userAgent,
    platform: data?.platform,
    architecture,
    maxTouchPoints: nav.maxTouchPoints,
  };
}
