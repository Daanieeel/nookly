/// The editor's formatting commands, by id: the toolbar (React Native) names one, the
/// editor (web view) runs it.

import { z } from "zod";

export const TOOLBAR = [
  { id: "bold", label: "Bold" },
  { id: "italic", label: "Italic" },
  { id: "underline", label: "Underline" },
  { id: "strike", label: "Strikethrough" },
  { id: "code", label: "Code" },
  { id: "h1", label: "Heading" },
  { id: "h2", label: "Subheading" },
  { id: "bullets", label: "Bulleted list" },
  { id: "numbers", label: "Numbered list" },
  { id: "tasks", label: "Task list" },
  { id: "quote", label: "Quote" },
  { id: "outdent", label: "Outdent" },
  { id: "indent", label: "Indent" },
  { id: "undo", label: "Undo" },
  { id: "redo", label: "Redo" },
] as const;

export type ToolbarId = (typeof TOOLBAR)[number]["id"];

/// What the editor tells the phone about itself: whether it has the keyboard, and
/// which of the toolbar's formats are on at the cursor.
export const editorStateSchema = z.object({
  focused: z.boolean(),
  on: z.partialRecord(z.string(), z.boolean()),
});

export type EditorState = z.infer<typeof editorStateSchema>;
