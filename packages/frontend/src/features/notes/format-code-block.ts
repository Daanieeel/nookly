import type { Editor } from "@tiptap/core";
import { canFormat, formatCode } from "./format-code";

/// What formatting a code block did: it was `formatted`, there was nothing to change
/// (`unchanged`), the code does not parse (`failed`), its language has no formatter
/// (`unsupported`), or the block was edited meanwhile (`changed`) and is left as the user has it.
export type FormatResult = "formatted" | "unchanged" | "failed" | "unsupported" | "changed";

/// Formats the code block at `pos` in place, as one step the user can undo. Formatting runs
/// off the main flow (Prettier loads on first use), so the code is checked again before it is
/// replaced, and anything typed in the meantime wins.
export async function formatCodeBlock(editor: Editor, pos: number): Promise<FormatResult> {
  const node = editor.state.doc.nodeAt(pos);
  if (node?.type.name !== "codeBlock") return "unsupported";
  const language: string | null = node.attrs.language ?? null;
  if (!canFormat(language)) return "unsupported";
  const original = node.textContent;
  const formatted = await formatCode(original, language);
  if (formatted === null) return "failed";
  if (formatted === original) return "unchanged";
  const current = editor.state.doc.nodeAt(pos);
  if (current?.type.name !== "codeBlock" || current.textContent !== original) return "changed";
  const { tr, schema } = editor.state;
  editor.view.dispatch(
    formatted
      ? tr.replaceWith(pos + 1, pos + 1 + current.content.size, schema.text(formatted))
      : tr.delete(pos + 1, pos + 1 + current.content.size),
  );
  return "formatted";
}
