/// <reference lib="dom" />
import type { Attrs, Node as ProseNode } from "prosemirror-model";
import type { NodeViewConstructor } from "prosemirror-view";
import { type FoundItem, heldBy, isLink, mentionRows } from "./block-bridge.ts";
import { CLOSE, OPEN, button, el, field, markOf, text } from "./block-dom.ts";

/// What the media, link and card blocks ask of the page.
export interface MediaActions {
  editable(): boolean;
  search(query: string, types: string[]): Promise<FoundItem[]>;
  /// A file picked on the phone, as the rows of a block; null when none was picked.
  upload(): Promise<{ rows: string } | { error: string } | null>;
  bookmark(url: string): Promise<{ rows: string } | { error: string }>;
  open(href: string): void;
}

export const MEDIA_BLOCK_TYPES = [
  "image",
  "video",
  "audio",
  "file",
  "embed",
  "bookmark",
  "entity_card",
] as const;
export type MediaBlockType = (typeof MEDIA_BLOCK_TYPES)[number];

interface MediaSpec {
  icon: string;
  name: string;
  /// What the link field asks for.
  prompt: string;
  /// The items a block can point at, and what the button that finds them says.
  types: string[];
  fromLabel: string | null;
  /// Whether a file can be picked on the phone, and whether a link becomes a Bookmark.
  upload: boolean;
  bookmarks: boolean;
  /// Whether the block has a link field at all: a card only searches.
  link: boolean;
  caption: boolean;
}

export const MEDIA_SPECS = {
  image: {
    icon: "image",
    name: "Image",
    prompt: "Paste an image link",
    types: ["file"],
    fromLabel: "From Files",
    upload: true,
    bookmarks: false,
    link: true,
    caption: true,
  },
  video: {
    icon: "video",
    name: "Video",
    prompt: "Paste a video link",
    types: ["file"],
    fromLabel: "From Files",
    upload: true,
    bookmarks: false,
    link: true,
    caption: true,
  },
  audio: {
    icon: "audio",
    name: "Audio",
    prompt: "Paste an audio link",
    types: ["file"],
    fromLabel: "From Files",
    upload: true,
    bookmarks: false,
    link: true,
    caption: true,
  },
  file: {
    icon: "file",
    name: "File",
    prompt: "Paste a link to a file",
    types: ["file"],
    fromLabel: "From Files",
    upload: true,
    bookmarks: false,
    link: true,
    caption: true,
  },
  embed: {
    icon: "embed",
    name: "Embed",
    prompt: "Paste a YouTube, Vimeo, Loom, Figma, Maps or Spotify link",
    types: [],
    fromLabel: null,
    upload: false,
    bookmarks: false,
    link: true,
    caption: false,
  },
  bookmark: {
    icon: "bookmark",
    name: "Web bookmark",
    prompt: "Paste a link to bookmark",
    types: ["bookmark"],
    fromLabel: "From Bookmarks",
    upload: false,
    bookmarks: true,
    link: true,
    caption: false,
  },
  entity_card: {
    icon: "linked",
    name: "Linked item",
    prompt: "Search for an item to link",
    types: [],
    fromLabel: null,
    upload: false,
    bookmarks: false,
    link: false,
    caption: false,
  },
} satisfies Record<MediaBlockType, MediaSpec>;

/// A link, shortened to what is worth reading: the site and the start of its path.
function shortLink(url: string): string {
  try {
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}`.replace(/\/$/, "");
    return `${parsed.host}${path.length > 28 ? `${path.slice(0, 28)}…` : path}`;
  } catch {
    return url;
  }
}

/// The blocks that point at something (Image, Video, Audio, File, Embed, Web bookmark, Linked
/// item) as the desktop draws them: a form to paste a link, search the phone's items or pick a
/// file, and once it holds one, a card to open or replace, with a caption for the media.
export function mediaBlockView(type: MediaBlockType, actions: MediaActions): NodeViewConstructor {
  const spec: MediaSpec = MEDIA_SPECS[type];
  return (node, view, getPos) => {
    const dom = el("div", `mb mb-${type}`, { "data-node": type });
    dom.contentEditable = "false";
    let shown = node;
    // A search answered late is not shown over a newer one.
    let asked = 0;

    const write = (changes: Attrs) => {
      const pos = getPos();
      if (pos === undefined) return;
      const attrs = { ...node.attrs, ...changes };
      node = node.type.create(attrs, null, node.marks);
      shown = node;
      view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, attrs));
    };

    /// Fills the block, and draws what it holds.
    const hold = (rows: string) => {
      write({ rows });
      draw();
    };

    const header = () => {
      const head = el("div", "mb-head");
      head.innerHTML = `<span class="mb-mark">${markOf(spec.icon, 16)}</span><span>${spec.name}</span>`;
      return head;
    };

    const drawEmpty = () => {
      const editable = actions.editable();
      dom.replaceChildren(header());
      const error = el("div", "mb-error", { role: "alert" });
      const results = el("div", "mb-results", { role: "listbox" });
      const form = el("form", "mb-form");
      const input = field("mb-url", spec.prompt, spec.prompt, "", { readOnly: !editable });
      input.type = spec.link ? "url" : "search";
      input.inputMode = spec.link ? "url" : "search";
      input.enterKeyHint = spec.link ? "go" : "search";
      form.append(input);
      let finding: string[] | null = spec.link ? null : spec.types;

      const showResults = async (query: string) => {
        const turn = ++asked;
        const items = await actions.search(query, finding ?? []);
        if (turn !== asked) return;
        results.replaceChildren();
        if (items.length === 0) {
          const none = el("p", "mb-none");
          none.textContent = "No items found";
          results.append(none);
          return;
        }
        for (const item of items) {
          const row = button("mb-result", item.title || "Untitled", "", () =>
            hold(mentionRows(item.title, item.id)),
          );
          row.setAttribute("role", "option");
          const name = el("span", "mb-result-name");
          name.textContent = item.title || "Untitled";
          const key = el("small");
          key.textContent = item.key;
          row.append(name, key);
          results.append(row);
        }
      };

      const find = (types: string[], placeholder: string) => {
        finding = types;
        input.type = "search";
        input.inputMode = "search";
        input.enterKeyHint = "search";
        input.placeholder = placeholder;
        input.value = "";
        error.textContent = "";
        input.focus();
        void showResults("");
      };

      input.addEventListener("input", () => {
        error.textContent = "";
        if (finding) void showResults(input.value);
      });

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (finding) return;
        const link = input.value.trim();
        if (!isLink(link)) {
          error.textContent = "Enter a link that starts with https://";
          return;
        }
        if (!spec.bookmarks) return hold(link);
        go.disabled = true;
        const answer = await actions.bookmark(link);
        go.disabled = false;
        if ("error" in answer) error.textContent = answer.error;
        else hold(answer.rows);
      });

      const go = el("button", "mb-go", { type: "submit" });
      go.textContent = spec.bookmarks ? "Add" : spec.link ? "Add" : "Find";
      go.disabled = !editable;
      if (spec.link) form.append(go);
      dom.append(form);

      if (editable) {
        const actionsRow = el("div", "mb-actions");
        if (spec.upload) {
          actionsRow.append(
            button("mb-action", "Upload a file", "<span>Upload</span>", async () => {
              const answer = await actions.upload();
              if (!answer) return;
              if ("error" in answer) error.textContent = answer.error;
              else hold(answer.rows);
            }),
          );
        }
        if (spec.fromLabel) {
          actionsRow.append(
            button("mb-action", spec.fromLabel, `<span>${spec.fromLabel}</span>`, () =>
              find(spec.types, `Search ${spec.fromLabel?.replace("From ", "")}`),
            ),
          );
        }
        if (actionsRow.childElementCount > 0) dom.append(actionsRow);
      }
      dom.append(error, results);
      // A card has nothing to paste: it opens on what was opened last.
      if (!spec.link) void showResults("");
    };

    const drawFilled = (rows: string) => {
      const held = heldBy(rows);
      const editable = actions.editable();
      dom.replaceChildren();
      if (held.kind === "url" && type === "image") {
        const picture = el("img", "mb-picture", { alt: text(node.attrs.caption), src: held.url });
        dom.append(picture);
      }
      if (held.kind === "url" && (type === "video" || type === "audio")) {
        const player = el(type, "mb-player", { src: held.url, controls: "", preload: "metadata" });
        dom.append(player);
      }
      const row = el("div", "mb-card");
      const label =
        held.kind === "mention"
          ? held.label
          : held.kind === "url"
            ? shortLink(held.url)
            : text(rows).trim();
      const name = el("span", "mb-label");
      name.textContent = label;
      const mark = el("span", "mb-mark");
      mark.innerHTML = markOf(spec.icon, 18);
      row.append(mark, name);
      const href =
        held.kind === "mention" ? `mention:${held.id}` : held.kind === "url" ? held.url : "";
      if (href) row.append(button("mb-icon", `Open ${spec.name}`, OPEN, () => actions.open(href)));
      if (editable) row.append(button("mb-icon", `Replace ${spec.name}`, CLOSE, () => hold("")));
      dom.append(row);
      if (spec.caption) {
        const caption = field("mb-caption", "Caption", "Add a caption", text(node.attrs.caption), {
          readOnly: !editable,
        });
        caption.addEventListener("input", () => write({ caption: caption.value || null }));
        dom.append(caption);
      }
    };

    const draw = () => {
      const rows = text(node.attrs.rows);
      if (heldBy(rows).kind === "empty") drawEmpty();
      else drawFilled(rows);
    };
    draw();

    return {
      dom,
      update(next: ProseNode) {
        if (next.type !== node.type) return false;
        const same =
          next.attrs.rows === shown.attrs.rows && next.attrs.caption === shown.attrs.caption;
        node = next;
        shown = next;
        // What this block just wrote is on the screen; a change from elsewhere is drawn.
        if (!same) draw();
        return true;
      },
      stopEvent: () => true,
      ignoreMutation: () => true,
    };
  };
}
