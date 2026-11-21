export type Platform = "desktop" | "mobile";

const KEY = "nookly-components-platform";

/// The platform asked for in the address (`?platform=mobile`), else the one used last.
export function readPlatform(): Platform {
  try {
    const asked = new URLSearchParams(location.search).get("platform") ?? localStorage.getItem(KEY);
    return asked === "mobile" ? "mobile" : "desktop";
  } catch {
    return "desktop";
  }
}

export function writePlatform(platform: Platform) {
  try {
    localStorage.setItem(KEY, platform);
    const url = new URL(location.href);
    url.searchParams.set("platform", platform);
    history.replaceState(null, "", url);
  } catch {
    // Private windows can refuse storage; the choice still holds for this visit.
  }
}
