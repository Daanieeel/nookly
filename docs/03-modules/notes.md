# Module: Notes

A block-based editor in the style of Notion.

## Blocks

A true block model. Every block can be addressed, reordered, and used as a relationship target on its own (see [block-level addressing](../02-entity-model.md#block-level-addressing-notes-only)).

Every block type, standard or custom, **must** implement a markdown serialization method. This guarantees that exporting a full page to plain markdown always works, even with custom blocks. A complete export matters more than a pretty one.

## v1 Scope

Ship only the standard blocks: paragraph, headings, lists, code, quote, table, image, and embed.

Custom blocks: `callout`, `timeline`, `progress`, `tree`, `steps`, `stats`, `details`, `checklist`, `divider`, `toggle`, `equation`, `math`, `diagram` (Mermaid), `circuit` (logic gates drawn from boolean expressions, with a third tab to draw them by hand and check the drawing against the code), `entity_card` (a mention of any entity, shown as a card), `image`, `video`, `audio`, `file` (a File entity or a URL; uploads land in Files), `bookmark` (a Bookmark entity as a preview card), `embed` (YouTube, Vimeo, Loom, Figma, Maps, Spotify, CodePen inline), plus inline math (`$…$` in any text, literal dollars as `\$`) and toggle headings (a `toggle` attr on a heading, folding the blocks up to the next heading of its level). Each is registered once in `src-tauri/src/db/block_types.rs` (content format, attrs, validation, markdown), which the CLI and export read. They export as [mdxcn](https://mdxcn.dev) framed ASCII in a code fence.

Custom blocks from third party modules are still future work.

## Page Files

A Note or Jot exports as a `nookly-page` JSON file (version 1): `format`, `version`, `kind`, `title` and the `blocks` in order, each with `type`, `content`, `language`, `filename` and `attrs`, so every block type ports natively instead of through markdown. Ids, timestamps, labels, links, the icon and the Space are not exported.
Mentions become plain text. A block that points at a File or another entity (image, video, audio, file, bookmark, entity card) becomes a paragraph with that item's name, since it does not exist for the reader. Media and embeds that hold a plain URL stay as they are.
Import always creates a new page in the chosen Space from a file of up to 20 MB. An unknown block type becomes a paragraph, a block that fails its type's checks refuses the whole file, and nothing is created on any error. The titlebar Import button, Cmd+I (outside text fields) and the "Import Page from File" command open a dialog that picks the file, lists what it creates and leaves out, lets the user pick the Space and relations for the new page, and imports only after a confirmation.

The Share button at the top of a page's details sidebar, and Share in its more actions menu, offer Markdown or the Nookly page file and open the system share menu through the Web Share API. Where the webview cannot share files, the same choice opens the save dialog instead.
Code is in `src-tauri/src/db/page_json.rs`. It is an app level file action, not an entity or field, so it has no CLI schema entry.

## Markdown Everywhere

Custom markdown works in every free text field across the app, not just in Notes. Tasks, Exams, and every other module support it too.

## Mention Labels

A mention is a link whose label is the entity's title when it was written. Renaming any entity rewrites the labels that still show its old title (or "Untitled Note" and the like, when it had none) in every page block, inside the rename. A label the author changed is left alone.

## Layout Direction

A full-width document canvas. The writing surface never uses a list plus detail pane split. The page itself is the canvas.

## Creation UX

A new Note drops the user straight into the canvas with the cursor focused and ready to type. The title comes first and content follows immediately. There is no intermediate form.
