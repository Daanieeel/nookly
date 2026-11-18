import { GITHUB_REPO, RELEASES_URL } from "./site";

export type DownloadId =
  | "mac-arm"
  | "mac-intel"
  | "windows-exe"
  | "windows-msi"
  | "linux-appimage"
  | "linux-deb"
  | "linux-rpm";

export type Os = "macos" | "windows" | "linux";

export type Download = {
  id: DownloadId;
  os: Os;
  file: string;
  url: string;
  /// Bytes, or null when the release could not be read at build time.
  size: number | null;
};

export type Release = {
  /// `0.75.3`, or null when GitHub could not be reached at build time.
  version: string | null;
  publishedAt: string | null;
  url: string;
  downloads: Download[];
  checksums: { sums: string; signature: string | null } | null;
};

/// Which installer each release asset is, by the names the release workflow gives them
/// (`Nookly_0.75.3_aarch64.dmg`, `Nookly-0.75.3-1.x86_64.rpm` ...).
const ASSETS: { id: DownloadId; os: Os; match: RegExp }[] = [
  { id: "mac-arm", os: "macos", match: /_aarch64\.dmg$/ },
  { id: "mac-intel", os: "macos", match: /_x64\.dmg$/ },
  { id: "windows-exe", os: "windows", match: /_x64-setup\.exe$/ },
  { id: "windows-msi", os: "windows", match: /_x64_[a-z]{2}-[A-Z]{2}\.msi$/ },
  { id: "linux-appimage", os: "linux", match: /_amd64\.AppImage$/ },
  { id: "linux-deb", os: "linux", match: /_amd64\.deb$/ },
  { id: "linux-rpm", os: "linux", match: /\.x86_64\.rpm$/ },
];

export const DOWNLOAD_IDS = ASSETS.map((a) => a.id);

export function osOf(id: DownloadId): Os {
  // SAFETY: every id comes from ASSETS.
  return ASSETS.find((a) => a.id === id)!.os;
}

type GithubRelease = {
  tag_name: string;
  published_at: string | null;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  assets: { name: string; size: number; browser_download_url: string }[];
};

export function parseRelease(release: GithubRelease): Release {
  const asset = (name: string) => release.assets.find((a) => a.name === name);
  const downloads: Download[] = [];
  for (const { id, os, match } of ASSETS) {
    const found = release.assets.find((a) => match.test(a.name));
    if (found) {
      downloads.push({
        id,
        os,
        file: found.name,
        url: found.browser_download_url,
        size: found.size,
      });
    }
  }
  const sums = asset("SHA256SUMS");
  return {
    version: release.tag_name.replace(/^v/, ""),
    publishedAt: release.published_at,
    url: release.html_url,
    downloads,
    checksums: sums
      ? {
          sums: sums.browser_download_url,
          signature: asset("SHA256SUMS.asc")?.browser_download_url ?? null,
        }
      : null,
  };
}

/// Every installer pointing at the releases page, for a build without network access.
export const FALLBACK_RELEASE: Release = {
  version: null,
  publishedAt: null,
  url: `${RELEASES_URL}/latest`,
  downloads: ASSETS.map(({ id, os }) => ({
    id,
    os,
    file: "",
    url: `${RELEASES_URL}/latest`,
    size: null,
  })),
  checksums: null,
};

function githubHeaders(): HeadersInit {
  const token = process.env.GITHUB_TOKEN;
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "nookly-website-build",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

let cached: Promise<Release> | null = null;

/// The latest desktop release (`v*` tags; server and mobile tags make no GitHub Release),
/// read once per build.
export function latestRelease(): Promise<Release> {
  cached ??= fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
    headers: githubHeaders(),
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
      return parseRelease((await response.json()) as GithubRelease);
    })
    .catch((error: unknown) => {
      console.warn(`Latest release unavailable, linking the releases page: ${String(error)}`);
      return FALLBACK_RELEASE;
    });
  return cached;
}

let stars: Promise<number | null> | null = null;

/// The repository's star count at build time; the nav refreshes it in the browser.
export function starCount(): Promise<number | null> {
  stars ??= fetch(`https://api.github.com/repos/${GITHUB_REPO}`, { headers: githubHeaders() })
    .then(async (response) => {
      if (!response.ok) return null;
      const repo = (await response.json()) as { stargazers_count?: number };
      return repo.stargazers_count ?? null;
    })
    .catch(() => null);
  return stars;
}

export function formatSize(bytes: number | null, locale: string): string | null {
  if (bytes === null) return null;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(bytes / 1_000_000)} MB`;
}
