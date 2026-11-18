/**
 * @jest-environment jsdom
 */
import { pageSchema as EDITOR_SCHEMA } from "./schema.ts";
import { prosemirrorToYXmlFragment, ySyncPlugin } from "@tiptap/y-tiptap";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import * as Y from "yjs";
import type { Origin } from "./bridge.ts";
import { blockIds } from "./commands.ts";
import { loadGate } from "./load-gate.ts";

/// The phone's copy of a page with one paragraph.
function phonePage() {
  const page = new Y.Doc();
  const node = EDITOR_SCHEMA.node("doc", null, [
    EDITOR_SCHEMA.node("paragraph", null, [EDITOR_SCHEMA.text("Hello")]),
  ]);
  prosemirrorToYXmlFragment(node, page.getXmlFragment("default"));
  return page;
}

/// Opens the page in a fresh web view copy, as the phone does, and sends the edits back.
async function open(page: Y.Doc) {
  const webview = new Y.Doc();
  webview.on("update", (update: Uint8Array, origin: Origin) => {
    if (origin !== "phone") Y.applyUpdate(page, update);
  });
  const views: EditorView[] = [];
  const build = () => {
    const fragment = webview.getXmlFragment("default");
    const state = EditorState.create({
      schema: EDITOR_SCHEMA,
      plugins: [ySyncPlugin(fragment), blockIds],
    });
    views.push(new EditorView(document.createElement("div"), { state }));
  };
  const gate = loadGate(webview, build);
  // The page crosses the bridge a moment later.
  await new Promise((resolve) => setTimeout(resolve, 10));
  gate.apply(Y.encodeStateAsUpdate(page), "phone");
  await new Promise((resolve) => setTimeout(resolve, 10));
  views.forEach((v) => v.destroy());
}

const paragraphs = (page: Y.Doc) => page.getXmlFragment("default").length;

describe("opening a page in the editor", () => {
  // On the phone each open of a task added a blank paragraph at the end (one had twelve):
  // the web view's editor bound to its still empty copy and wrote a line of its own before
  // the page crossed the bridge. jsdom does not draw that first line, so this checks the
  // order that prevents it: the page first, then the editor.
  it("binds the editor only once the page is in", async () => {
    const webview = new Y.Doc();
    const built: number[] = [];
    const gate = loadGate(webview, () => built.push(webview.getXmlFragment("default").length));
    expect(gate.loaded).toBe(false);
    gate.apply(Y.encodeStateAsUpdate(phonePage()), "phone");
    gate.apply(Y.encodeStateAsUpdate(new Y.Doc()), "phone");
    expect(built).toEqual([1]);
  });

  it("adds nothing when the editor waits for the page", async () => {
    const page = phonePage();
    await open(page);
    await open(page);
    expect(paragraphs(page)).toBe(1);
  });
});
