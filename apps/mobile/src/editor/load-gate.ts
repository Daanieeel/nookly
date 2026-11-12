import * as Y from "yjs";
import type { Origin } from "./bridge.ts";

/// The web view's copy of a page waits for the phone's before an editor binds to it. An
/// editor bound to an empty document fills it with an empty paragraph of its own, which
/// then joins the page's real text once that arrives: a blank line more on every open.
export function loadGate(doc: Y.Doc, build: () => void) {
  let loaded = false;
  return {
    /// An update from the phone; the first one is the whole page, then the editor starts.
    apply(update: Uint8Array, origin: Origin) {
      Y.applyUpdate(doc, update, origin);
      if (loaded) return;
      loaded = true;
      build();
    },
    get loaded() {
      return loaded;
    },
  };
}
