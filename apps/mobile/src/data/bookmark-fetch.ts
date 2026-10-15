import { type PageMetadata, pageMetadata } from "@nookly/shared/data";

/// Reads a bookmarked page's head, as the desktop does when a bookmark is made: best effort,
/// and it fails quietly offline. Redirects are followed and relative icon and image paths
/// resolve against where they ended up.
export async function fetchPageMetadata(url: string, timeoutMs = 10_000): Promise<PageMetadata> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`The page answered ${response.status}.`);
    // Only the start of the page matters, and a large one needn't be read whole.
    const html = (await response.text()).slice(0, 600_000);
    return pageMetadata(html, response.url || url);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("The page took too long to answer.");
    }
    throw new Error(error instanceof Error ? error.message : "Couldn't reach the page.");
  } finally {
    clearTimeout(timer);
  }
}
