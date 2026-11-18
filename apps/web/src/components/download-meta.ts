import type { DownloadId, Os } from "@/lib/releases";
import type { Brand } from "./brand-icon";

/// The order operating systems are listed in, everywhere downloads are.
export const OS_ORDER: Os[] = ["macos", "windows", "linux"];

/// The mark each installer is shown with: Debian's swirl for the .deb, Fedora's for the .rpm.
export const BRAND_OF: Record<DownloadId, Brand> = {
  "mac-arm": "apple",
  "mac-intel": "apple",
  "windows-exe": "windows",
  "windows-msi": "windows",
  "linux-appimage": "linux",
  "linux-deb": "debian",
  "linux-rpm": "fedora",
};
