/// <reference lib="dom" />
import { CODE_LANGUAGE_MARKS } from "@nookly/frontend/lib/code-language-marks";
import type { Node as ProseNode } from "prosemirror-model";
import type { NodeViewConstructor } from "prosemirror-view";

/// Tabler's icons, as the desktop draws them.
const svg = (paths: string, size = 16) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const COPY = svg(
  '<path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666" /><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" />',
  18,
);
const CHECK = svg('<path d="M5 12l5 5l10 -10" />', 18);
const CHEVRON = svg('<path d="M6 9l6 6l6 -6" />', 14);

/// What a code block's header asks of the phone: a language from its sheet, the code on
/// the clipboard.
export interface CodeBlockActions {
  pickLanguage(pos: number, language: string): void;
  copy(code: string): void;
  editable(): boolean;
}

function languageName(language: string): { label: string; mark: string } {
  const found = CODE_LANGUAGE_MARKS.find((l) => l.value === language);
  return found ? { label: found.label, mark: found.svg } : { label: "Plain Text", mark: "" };
}

/// A code block as the desktop draws it: a header with the file's name, the language and
/// a copy button, over the code.
export function codeBlockView(actions: CodeBlockActions): NodeViewConstructor {
  return (node, view, getPos) => {
    const dom = document.createElement("div");
    dom.className = "codeblock";
    const header = document.createElement("div");
    header.className = "codeblock-header";
    header.contentEditable = "false";

    const name = document.createElement("input");
    name.className = "codeblock-name";
    name.placeholder = "Untitled";
    name.spellcheck = false;
    name.autocapitalize = "off";
    name.setAttribute("aria-label", "File name");
    name.addEventListener("input", () => {
      const pos = getPos();
      if (pos === undefined) return;
      view.dispatch(view.state.tr.setNodeAttribute(pos, "filename", name.value || null));
    });

    const language = document.createElement("button");
    language.type = "button";
    language.className = "codeblock-language";
    language.addEventListener("mousedown", (event) => event.preventDefault());
    language.addEventListener("click", () => {
      const pos = getPos();
      if (pos !== undefined) actions.pickLanguage(pos, String(node.attrs.language ?? "plaintext"));
    });

    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "codeblock-copy";
    copy.setAttribute("aria-label", "Copy code");
    copy.innerHTML = COPY;
    let copied: ReturnType<typeof setTimeout> | undefined;
    copy.addEventListener("mousedown", (event) => event.preventDefault());
    copy.addEventListener("click", () => {
      actions.copy(node.textContent);
      copy.innerHTML = CHECK;
      clearTimeout(copied);
      copied = setTimeout(() => (copy.innerHTML = COPY), 1500);
    });

    header.append(name, language, copy);
    const pre = document.createElement("pre");
    pre.className = "codeblock-body";
    const code = document.createElement("code");
    pre.append(code);
    dom.append(header, pre);

    const draw = (n: ProseNode) => {
      const filename = String(n.attrs.filename ?? "");
      if (document.activeElement !== name && name.value !== filename) name.value = filename;
      const editable = actions.editable();
      name.readOnly = !editable;
      language.disabled = !editable;
      const { label, mark } = languageName(String(n.attrs.language ?? "plaintext"));
      language.setAttribute("aria-label", `Language, ${label}`);
      language.innerHTML = `${mark ? `<span class="mark">${mark}</span>` : ""}<span>${label}</span>${editable ? CHEVRON : ""}`;
    };
    draw(node);

    return {
      dom,
      contentDOM: code,
      update(next) {
        if (next.type !== node.type) return false;
        node = next;
        draw(next);
        return true;
      },
      // The header's own controls keep their touches; the editor never sees them.
      stopEvent: (event) => event.target instanceof Node && header.contains(event.target),
      ignoreMutation: (mutation) => header.contains(mutation.target),
      destroy: () => clearTimeout(copied),
    };
  };
}
