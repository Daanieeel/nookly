import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { makeEntity } from "#/test/fixtures.ts";
import { editorExtensions } from "./editor-extensions";
import { openLink } from "./open-link";
import { useNavStore } from "#/lib/store/nav.ts";

const ID = "44cb4caf-53bf-4b95-8ecb-869e084c4716";
const BLOCK = "2f991ea3-a987-407d-af3c-747829de469d";
const URL = `nookly://open/${ID}#${BLOCK}`;

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

function open() {
  editor = new Editor({
    extensions: editorExtensions({ spaceId: "s", pageId: "p", getEntities: () => [] }),
    content: { type: "doc", content: [{ type: "paragraph" }] },
  });
  return editor;
}

function paste(view: Editor, text: string) {
  // SAFETY: jsdom has no ClipboardEvent; the paste handler only reads `clipboardData`.
  const event = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", {
    value: { getData: (type: string) => (type === "text/plain" ? text : "") },
  });
  return view.view.someProp("handlePaste", (f) => f(view.view, event, view.state.doc.slice(0, 0)));
}

describe("a nookly link pasted into a page", () => {
  it("becomes a link, which can be clicked", () => {
    const view = open();
    expect(paste(view, URL)).toBe(true);
    const run = view.state.doc.child(0).child(0);
    expect(run.text).toBe(URL);
    expect(run.marks.map((m) => [m.type.name, m.attrs.href])).toEqual([["link", URL]]);
  });

  it("is left alone when it is not an exact Nookly link", () => {
    const view = open();
    expect(paste(view, "nookly://delete/abc")).toBeFalsy();
    expect(paste(view, `see ${URL}`)).toBeFalsy();
  });

  it("opens what it points at when clicked", async () => {
    mockCommand("get_entity", makeEntity({ id: ID, spaceId: "s9" }));
    mockCommand("touch_entity_opened", null);
    const link = document.createElement("a");
    link.setAttribute("href", URL);
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "target", { value: link });
    expect(openLink(event, "s")).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    await new Promise((r) => setTimeout(r, 30));
    expect(callsOf("get_entity")[0]).toMatchObject({ id: ID });
    expect(useNavStore.getState().view).toMatchObject({ kind: "entity", entityId: ID });
  });
});
