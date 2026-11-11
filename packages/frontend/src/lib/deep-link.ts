import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { notify } from "#/components/notify.tsx";
import { openMention } from "#/features/notes/open-link.ts";
import { getEntity } from "#/lib/api/entities.ts";
import { parseDeepLink } from "./deep-link-url.ts";

export { deepLinkFor, parseDeepLink } from "./deep-link-url.ts";

type Handler = (url: string) => void;

/// Links wait here until the app has loaded and attached its handler, so a link that starts
/// Nookly is not lost on the way. Each link is handed over once.
export function createDeepLinkQueue() {
  const waiting: string[] = [];
  let handler: Handler | null = null;
  return {
    receive(url: string) {
      if (handler) handler(url);
      else waiting.push(url);
    },
    /// Takes the waiting links, then every later one. Returns the way to detach again.
    attach(next: Handler): () => void {
      handler = next;
      for (const url of waiting.splice(0)) next(url);
      return () => {
        if (handler === next) handler = null;
      };
    },
  };
}

export const deepLinks = createDeepLinkQueue();

/// Starts listening, before the app has loaded: collects the link Nookly was started with, and
/// the ones that arrive afterwards. Without the plugin (a development build, the tests) it
/// does nothing.
export async function startDeepLinks(queue = deepLinks): Promise<void> {
  try {
    for (const url of (await getCurrent()) ?? []) queue.receive(url);
    await onOpenUrl((urls) => urls.forEach((url) => queue.receive(url)));
  } catch {
    // No deep link support here: links just don't open the app.
  }
}

export type DeepLinkResult = "opened" | "not-found" | "refused";

/// Opens what a link points at. A link that isn't a Nookly link, or names something that is
/// not here, changes nothing and says so. An entity in the Trash opens like anywhere.
export async function openDeepLink(url: string): Promise<DeepLinkResult> {
  const target = parseDeepLink(url);
  if (!target) {
    notify.caution("Couldn't open this link", { description: "It is not a Nookly link." });
    return "refused";
  }
  try {
    const entity = await getEntity(target.entityId);
    openMention(target, entity);
    return "opened";
  } catch {
    notify.caution("Nothing to open here", {
      description:
        "This link points at something that isn't in this Nookly. Links only work on the computer they were copied from.",
    });
    return "not-found";
  }
}
