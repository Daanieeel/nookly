/// The address fields show their scheme (`https://`) as fixed text beside the icon, so nobody has
/// to type it, and quietly drop it from anything typed or pasted. These two functions are that.

export type UrlScheme = "https://" | "http://";

const LEADING_SCHEME = /^\s*(https?|webcal):\/\//i;

/// An address split into the scheme the field shows and the part after it. `explicit` is whether
/// the text started with a scheme of its own. `webcal://` counts as `https://`.
export type SplitUrl = { scheme: UrlScheme; rest: string; explicit: boolean };

export function splitUrl(value: string): SplitUrl {
  let rest = value;
  let scheme: UrlScheme = "https://";
  let explicit = false;
  for (let match = LEADING_SCHEME.exec(rest); match; match = LEADING_SCHEME.exec(rest)) {
    // The first scheme decides; a doubled one (a paste onto a typed `https://`) is dropped too.
    if (!explicit) scheme = match[1]?.toLowerCase() === "http" ? "http://" : "https://";
    explicit = true;
    rest = rest.slice(match[0].length);
  }
  return { scheme, rest, explicit };
}

/// What the field now holds after the person typed or pasted `typed` into it while it showed
/// `scheme`: the whole address, or "" when nothing follows the scheme. The returned `scheme` is
/// the one to show next, which stays `http://` after it was typed even while nothing follows it.
export type TypedUrl = { scheme: UrlScheme; value: string };

export function typedUrl(typed: string, scheme: UrlScheme): TypedUrl {
  const split = splitUrl(typed);
  const next = split.explicit ? split.scheme : scheme;
  return { scheme: next, value: split.rest === "" ? "" : next + split.rest };
}
