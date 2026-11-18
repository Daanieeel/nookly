/// Signing in to Moodle the way the desktop does (`moodle/site.rs`, `moodle/login.rs`) and
/// the Moodle app does: Moodle's own launch page in the browser, so single sign on and two
/// step login work; it sends the person back to `nookly://token=<base64>` carrying
/// `<signature>:::<token>`. Any web page can open a `nookly://` link, so a token is only
/// taken with the signature of a sign in started here: `md5(site address + passport)`, with
/// a passport sent nowhere but to that site.

/// A Moodle site root, always https.
export interface Site {
  /// The address without a trailing slash, as Moodle writes `wwwroot`.
  root: string;
}

/// Path segments after which the rest of a pasted address is Moodle's own page, not part of
/// where the site is installed (`/moodle/course/view.php`).
const PAGES = new Set([
  "login",
  "my",
  "course",
  "mod",
  "calendar",
  "user",
  "admin",
  "grade",
  "message",
  "lib",
  "webservice",
  "enrol",
]);

/// Reads what a person types or pastes: `moodle.uni.edu`, or any page on the site. A site
/// that is not https is refused: the token would travel in the clear.
export function parseSite(input: string): Site {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Enter the address of your Moodle site.");
  let url: URL;
  try {
    url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error("That doesn't look like a web address.");
  }
  if (url.protocol !== "https:" || !url.hostname) throw new Error("Moodle sites must use https.");
  const kept: string[] = [];
  for (const segment of url.pathname.split("/").slice(1)) {
    if (!segment || segment.includes(".php") || PAGES.has(segment)) break;
    kept.push(segment);
  }
  return { root: `https://${url.host}${kept.length > 0 ? `/${kept.join("/")}` : ""}` };
}

/// A page on the site, relative to its root.
export const pageOf = (site: Site, relative: string) =>
  `${site.root}/${relative.replace(/^\/+/, "")}`;

export function launchUrl(site: Site, passport: string, scheme: string): string {
  const query = new URLSearchParams({
    service: "moodle_mobile_app",
    passport,
    urlscheme: scheme,
  });
  return `${pageOf(site, "admin/tool/mobile/launch.php")}?${query.toString()}`;
}

export interface Callback {
  signature: string;
  token: string;
}

const BAD_LINK = "That is not a Moodle sign in link. Start the sign in again.";

/// Reads what Moodle sent back: the whole `nookly://token=...` link, or just what follows
/// `token=`.
export function parseCallback(input: string): Callback {
  const trimmed = input.trim();
  const encoded = (trimmed.includes("token=") ? trimmed.split("token=")[1] : trimmed)
    .trim()
    .replace(/%3D/gi, "=")
    .replace(/%2F/gi, "/")
    .replace(/%2B/gi, "+");
  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    throw new Error(BAD_LINK);
  }
  const [signature, token] = decoded.split(":::");
  const plausible = (t: string | undefined) =>
    t !== undefined && t.length > 0 && t.length <= 256 && /^[A-Za-z0-9]+$/.test(t);
  if (!plausible(signature) || !plausible(token)) throw new Error(BAD_LINK);
  return { signature, token };
}

/// Whether `signature` proves the sign in started here. The site may call itself something
/// else than what was typed (`www.`), so every address known for it is tried.
export async function signatureMatches(
  signature: string,
  addresses: string[],
  passport: string,
  md5: (text: string) => Promise<string>,
): Promise<boolean> {
  for (const address of addresses) {
    const expected = await md5(`${address.replace(/\/+$/, "")}${passport}`);
    if (expected.toLowerCase() === signature.toLowerCase()) return true;
  }
  return false;
}
