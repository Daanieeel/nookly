import type { Entity } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { fileBaseName, savePageJsonFile, savePageMarkdownFile } from "./PageExportMenu.tsx";

export type ShareFormat = "markdown" | "json";

/// What a share option is called, and the file it hands over.
export const SHARE_FORMATS = {
  markdown: { label: "Markdown", hint: ".md file", extension: "md", mime: "text/markdown" },
  json: {
    label: "Nookly page",
    hint: ".json file",
    extension: "nookly.json",
    mime: "application/json",
  },
} satisfies Record<ShareFormat, { label: string; hint: string; extension: string; mime: string }>;

export function shareFileName(entity: Entity, format: ShareFormat): string {
  return `${fileBaseName(entity)}.${SHARE_FORMATS[format].extension}`;
}

/// `shared` went to the system share menu, `saved` to a file the user chose (where the
/// webview cannot share), `cancelled` means the user backed out of either.
export type ShareOutcome = "shared" | "saved" | "cancelled";

/// Opens the system share menu with the page as a file. `text` is the page already
/// rendered: the webview only lets a share start from a click, so nothing is awaited
/// between the click and the share. Where the webview cannot share files, or refuses,
/// the page goes through the save dialog instead.
export async function sharePage(
  entity: Entity,
  format: ShareFormat,
  text: string,
): Promise<ShareOutcome> {
  const file = new File([text], shareFileName(entity, format), {
    type: SHARE_FORMATS[format].mime,
  });
  const data = { files: [file], title: displayTitle(entity) };
  if ("canShare" in navigator && navigator.canShare(data)) {
    try {
      await navigator.share(data);
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      // Any other refusal (no user gesture, no share targets) falls through to saving.
    }
  }
  const saved = await (format === "markdown"
    ? savePageMarkdownFile(entity)
    : savePageJsonFile(entity));
  return saved ? "saved" : "cancelled";
}
