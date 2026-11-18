/// Where things live. The site is static, so these are read at build time and in the
/// browser alike.
export const SITE_URL = "https://nookly.work";
export const GITHUB_REPO = "Daanieeel/nookly";
export const GITHUB_URL = `https://github.com/${GITHUB_REPO}`;
export const RELEASES_URL = `${GITHUB_URL}/releases`;
export const SYNC_URL = "https://sync.nookly.work";
/// What the status checker writes every five minutes, on its own branch (see
/// `.github/workflows/status.yml`).
export const STATUS_DATA_URL = `https://raw.githubusercontent.com/${GITHUB_REPO}/status-data/status.json`;
