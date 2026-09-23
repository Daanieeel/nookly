# Module: Notes

A block-based editor in the style of Notion.

## Blocks

A true block model. Every block can be addressed, reordered, and used as a relationship target on its own (see [block-level addressing](../02-entity-model.md#block-level-addressing-notes-only)).

Every block type, standard or custom, **must** implement a markdown serialization method. This guarantees that exporting a full page to plain markdown always works, even with custom blocks. A complete export matters more than a pretty one.

## v1 Scope

Ship only the standard blocks: paragraph, headings, lists, code, quote, table, image, and embed.

Custom blocks: `callout`, `timeline`, `progress`, `tree`, `steps`, `stats`, `details`, `checklist`, `divider`. Each is registered once in `src-tauri/src/db/block_types.rs` (content format, attrs, validation, markdown), which the CLI and export read. They export as [mdxcn](https://mdxcn.dev) framed ASCII in a code fence.

Custom blocks from third party modules are still future work.

## Markdown Everywhere

Custom markdown works in every free text field across the app, not just in Notes. Tasks, Exams, and every other module support it too.

## Layout Direction

A full-width document canvas. The writing surface never uses a list plus detail pane split. The page itself is the canvas.

## Creation UX

A new Note drops the user straight into the canvas with the cursor focused and ready to type. The title comes first and content follows immediately. There is no intermediate form.
