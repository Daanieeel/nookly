/** @jest-environment jsdom */
import type { Attrs } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import type { FoundItem } from "./block-bridge.ts";
import {
  MEDIA_BLOCK_TYPES,
  type MediaActions,
  type MediaBlockType,
  mediaBlockView,
} from "./media-blocks.ts";
import { pageSchema as schema } from "./schema.ts";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// The media, link and card blocks are forms in the page: paste a link, pick a file or an item,
// and once they hold one a card to open or replace, with a caption for the media.
function open(type: MediaBlockType, attrs: Attrs = {}, found: FoundItem[] = []) {
  const host = document.createElement("div");
  document.body.append(host);
  const opened: string[] = [];
  const searches: { query: string; types: string[] }[] = [];
  const actions: MediaActions = {
    editable: () => true,
    search: async (query, types) => {
      searches.push({ query, types });
      return found;
    },
    upload: async () => ({ rows: "[lecture.pdf](mention:file-1)" }),
    bookmark: async (url) =>
      url.includes("bad")
        ? { error: "Couldn't add the bookmark, try again" }
        : { rows: "[example.com](mention:bm-1)" },
    open: (href) => void opened.push(href),
  };
  const block = schema.nodes[type].create({ rows: "", ...attrs });
  const doc = schema.nodes.doc.create(null, [block, schema.nodes.paragraph.create()]);
  const view = new EditorView(host, {
    state: EditorState.create({ doc }),
    nodeViews: { [type]: mediaBlockView(type, actions) },
  });
  const attr = (name: string) => view.state.doc.child(0).attrs[name];
  const press = (label: string) => {
    const target = host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
    if (!target) throw new Error(`no button ${label}`);
    target.click();
  };
  const submit = (value: string) => {
    const input = host.querySelector<HTMLInputElement>(".mb-url");
    if (!input) throw new Error("no link field");
    input.value = value;
    host
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  };
  return { host, attr, press, submit, opened, searches };
}

describe("an image, video, audio or file block", () => {
  it("takes a pasted link, and refuses text that is not one", () => {
    const b = open("image");
    b.submit("not a link");
    expect(b.host.querySelector(".mb-error")?.textContent).toMatch(/https/);
    expect(b.attr("rows")).toBe("");
    b.submit("https://example.com/cat.png");
    expect(b.attr("rows")).toBe("https://example.com/cat.png");
    // It now holds a picture, which can be opened, replaced or captioned.
    expect(b.host.querySelector("img")?.getAttribute("src")).toBe("https://example.com/cat.png");
    const caption = b.host.querySelector<HTMLInputElement>(".mb-caption");
    if (!caption) throw new Error("no caption");
    caption.value = "A cat";
    caption.dispatchEvent(new Event("input", { bubbles: true }));
    expect(b.attr("caption")).toBe("A cat");
    b.press("Open Image");
    expect(b.opened).toEqual(["https://example.com/cat.png"]);
    b.press("Replace Image");
    expect(b.attr("rows")).toBe("");
  });

  it("keeps a file picked on the phone as a mention of it", async () => {
    const b = open("file");
    b.press("Upload a file");
    await flush();
    expect(b.attr("rows")).toBe("[lecture.pdf](mention:file-1)");
    expect(b.host.querySelector(".mb-label")?.textContent).toBe("lecture.pdf");
    b.press("Open File");
    expect(b.opened).toEqual(["mention:file-1"]);
  });

  it("finds one of the Space's Files to point at", async () => {
    const b = open("video", {}, [{ id: "f1", title: "Lecture.mp4", key: "FIL-3" }]);
    b.press("From Files");
    await flush();
    expect(b.searches.at(-1)).toEqual({ query: "", types: ["file"] });
    const result = b.host.querySelector<HTMLButtonElement>(".mb-result");
    expect(result?.textContent).toContain("Lecture.mp4");
    result?.click();
    expect(b.attr("rows")).toBe("[Lecture.mp4](mention:f1)");
  });
});

describe("an embed, a web bookmark and a linked item", () => {
  it("embeds a link", () => {
    const b = open("embed");
    b.submit("https://www.youtube.com/watch?v=abc");
    expect(b.attr("rows")).toBe("https://www.youtube.com/watch?v=abc");
  });

  it("saves a link as a Bookmark, or says why it could not", async () => {
    const b = open("bookmark");
    b.submit("https://bad.example");
    await flush();
    expect(b.host.querySelector(".mb-error")?.textContent).toMatch(/Couldn't add/);
    expect(b.attr("rows")).toBe("");
    b.submit("https://example.com");
    await flush();
    expect(b.attr("rows")).toBe("[example.com](mention:bm-1)");
  });

  it("opens a linked item's search at once, on the items opened last", async () => {
    const b = open("entity_card", {}, [{ id: "t1", title: "Write report", key: "TSK-1" }]);
    await flush();
    expect(b.searches[0]).toEqual({ query: "", types: [] });
    b.host.querySelector<HTMLButtonElement>(".mb-result")?.click();
    expect(b.attr("rows")).toBe("[Write report](mention:t1)");
    b.press("Open Linked item");
    expect(b.opened).toEqual(["mention:t1"]);
  });
});

describe("every media block", () => {
  it("has a view the page can draw", () => {
    for (const type of MEDIA_BLOCK_TYPES) {
      expect(open(type).host.querySelector(`[data-node="${type}"]`)).toBeTruthy();
    }
  });
});
