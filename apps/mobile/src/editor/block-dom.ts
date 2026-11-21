/// <reference lib="dom" />
import { SLASH_ICON_PATHS } from "./slash-icons.ts";

/// Small helpers the blocks' views draw with: elements, Tabler icons, and the buttons that keep
/// the editor's selection and keyboard where they are while they are pressed.

/// A block's text attribute: the text, or nothing.
export const text = (value: string | null | undefined): string => value ?? "";

export const icon = (paths: string, size = 18) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

/// The block menu's mark for a block, as an icon.
export const markOf = (id: string, size = 18) => icon(SLASH_ICON_PATHS.get(id) ?? "", size);

export const PLUS = icon('<path d="M12 5l0 14" /><path d="M5 12l14 0" />');
export const CLOSE = icon('<path d="M18 6l-12 12" /><path d="M6 6l12 12" />');
export const CHECK = icon('<path d="M5 12l5 5l10 -10" />', 14);
export const OUTDENT = icon(
  '<path d="M20 6l-11 0" /><path d="M20 12l-7 0" /><path d="M20 18l-11 0" /><path d="M4 8l4 4l-4 4" />',
);
export const INDENT = icon(
  '<path d="M20 6l-7 0" /><path d="M20 12l-7 0" /><path d="M20 18l-7 0" /><path d="M4 8l4 4l-4 4" transform="translate(-0 0)" />',
);
export const OPEN = icon(
  '<path d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6" /><path d="M11 13l9 -9" /><path d="M15 4h5v5" />',
);

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  attrs: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  return node;
}

/// A button the editor does not take the selection from: pressing it leaves the keyboard up.
export function button(
  className: string,
  label: string,
  html: string,
  onPress: () => void,
): HTMLButtonElement {
  const node = el("button", className, { type: "button", "aria-label": label });
  node.innerHTML = html;
  node.addEventListener("mousedown", (event) => event.preventDefault());
  node.addEventListener("click", onPress);
  return node;
}

/// A text input of a block: no autocorrect, no capital, a name for screen readers.
export function field(
  className: string,
  label: string,
  placeholder: string,
  value: string,
  options: { numeric?: boolean; readOnly?: boolean } = {},
): HTMLInputElement {
  const input = el("input", className, { "aria-label": label });
  input.placeholder = placeholder;
  input.value = value;
  input.spellcheck = false;
  input.autocapitalize = "off";
  input.autocomplete = "off";
  input.enterKeyHint = "next";
  if (options.numeric) input.inputMode = "decimal";
  input.readOnly = Boolean(options.readOnly);
  return input;
}
