import { type PageMetadata, pageMetadata } from "@nookly/shared/data";

/// What a page's head says it is, enough to name a bookmark.
const NAMED = /<title[\s>]|<meta\s/i;

/// Reads a bookmarked page's head, as the desktop does when a bookmark is made: best effort,
/// and it fails quietly offline. Redirects are followed and relative icon and image paths
/// resolve against where they ended up. A site answering with an error (a bot check's 403)
/// often still sends a head with the site's icon and picture, which are kept; its title and
/// description are the error page's, so they are not. iOS lets an app fetch secure addresses only, so a plain `http` one is asked for
/// over https.
export async function fetchPageMetadata(url: string, timeoutMs = 10_000): Promise<PageMetadata> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const secure = url.replace(/^http:\/\//i, "https://");
  try {
    const response = await fetch(secure, { signal: controller.signal });
    // Only the start of the page matters, and a large one needn't be read whole.
    const html = (await response.text()).slice(0, 600_000);
    if (!response.ok && !NAMED.test(html)) {
      throw new Error(`The page answered ${response.status}.`);
    }
    const found = pageMetadata(html, response.url || secure);
    return response.ok ? found : { ...found, title: null, description: null };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("The page took too long to answer.");
    }
    throw new Error(error instanceof Error ? error.message : "Couldn't reach the page.");
  } finally {
    clearTimeout(timer);
  }
}
