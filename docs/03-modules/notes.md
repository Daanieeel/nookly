# Module: Notes

A block-based editor in the style of Notion.

## Blocks

A true block model. Every block can be addressed, reordered, and used as a relationship target on its own (see [block-level addressing](../02-entity-model.md#block-level-addressing-notes-only)).

Every block type, standard or custom, **must** implement a markdown serialization method. This guarantees that exporting a full page to plain markdown always works, even with custom blocks. A complete export matters more than a pretty one.

Every block type also **must** have a print layout in `BLOCK_EXPORTERS` (`packages/frontend/src/features/page-export/page-document.ts`), which the PDF, Word and OpenDocument exports read. The `satisfies Record<BlockType, …>` makes a block type without one a type error.

## v1 Scope

Ship only the standard blocks: paragraph, headings, lists, code, quote, table, image, and embed.

Custom blocks: `callout`, `timeline`, `progress`, `tree`, `steps`, `stats`, `details`, `checklist`, `divider`, `toggle`, `equation`, `math`, `diagram` (Mermaid), `circuit` (logic gates drawn from boolean expressions, with a third tab to draw them by hand and check the drawing against the code), `plot` (functions, constants (drawn as horizontal lines when no other line uses them), points, vectors written `A -> B`, named and summed (`a = 0 -> A`, `a + b`) and vertical lines in a coordinate system, one per line, with an optional window; a line starting with `!#` works but is not drawn; `features/notes/plot/`), `entity_card` (a mention of any entity, shown as a card), `image`, `video`, `audio`, `file` (a File entity, a URL, or the full path of a file on this computer; uploads land in Files), `bookmark` (a Bookmark entity as a preview card), `embed` (YouTube, Vimeo, Loom, Figma, Maps, Spotify, CodePen inline), plus inline math (`$…$` in any text, literal dollars as `\$`) and toggle headings (a `toggle` attr on a heading, folding the blocks up to the next heading of its level). Each is registered once in `src-tauri/src/db/block_types.rs` (content format, attrs, validation, markdown), which the CLI and export read. They export as [mdxcn](https://mdxcn.dev) framed ASCII in a code fence.

Custom blocks from third party modules are still future work.

## Page Files

A Note or Jot exports as a `nookly-page` JSON file (version 1): `format`, `version`, `kind`, `title` and the `blocks` in order, each with `type`, `content`, `language`, `filename` and `attrs`, so every block type ports natively instead of through markdown. Ids, timestamps, labels, links, the icon and the Space are not exported.
Mentions become plain text. A block that points at a File or another entity (image, video, audio, file, bookmark, entity card) becomes a paragraph with that item's name, since it does not exist for the reader. Media and embeds that hold a plain URL stay as they are.
Import always creates a new page in the chosen Space from a file of up to 20 MB. An unknown block type becomes a paragraph, a block that fails its type's checks refuses the whole file, and nothing is created on any error. The titlebar Import button, Cmd+I (outside text fields) and the "Import from File" command open a dialog (which also takes task, deck and assignment files) that picks the file, lists what it creates and leaves out, lets the user pick the Space and relations for the new page, and imports only after a confirmation.

## Export

**Export...** (the Export button, the more actions menu and the right click menu) opens one dialog for Markdown, PDF, Word (`.docx`) and OpenDocument (`.odt`), with a live preview of the pages beside the options: the title as a heading on top, page size, orientation, margins and text size, remembered per device. Copy Page as Markdown and Export as Nookly Page stay separate items.

Markdown comes from the backend as before. The other three are made in the webview from one print layout of the page (`features/page-export/`): every block turns into a few shared pieces (heading, paragraph, list, table, code, quote, callout, figure, rule), and one writer per format draws those (pdfmake, docx, and hand written ODF XML). Formulas (MathJax), diagrams (Mermaid), circuits and plots become pictures; one that fails to draw shows its source. Inline math goes into Word as a native equation (`latexToMath` from `docx/math`), falling back to the picture for a command it doesn't know. pdfmake can't put a picture inside a line, so the PDF leaves an invisible placeholder as wide and tall as the drawn formula, marked by a link, and `pdf-formulas.ts` draws the picture over it with pdf-lib and drops the link. A formula that fails to draw is spelled out in text in Noto Sans Math, which has the symbols Inter lacks. MathJax also learns KaTeX's extra commands (`\Rarr`, `\N`), so a formula exports as the editor shows it. The PDF embeds Inter, Source Code Pro and Noto Sans Math; Word and OpenDocument name Arial and Courier New, which every reader has. `write_page_export` writes the bytes and accepts only those three extensions.

The Share button at the top of a page's details sidebar, and Share in its more actions menu, offer Markdown or the Nookly page file and open the system share menu through the Web Share API. Where the webview cannot share files, the same choice opens the save dialog instead.
Code is in `src-tauri/src/db/page_json.rs`. It is an app level file action, not an entity or field, so it has no CLI schema entry.

## Markdown Everywhere

Custom markdown works in every free text field across the app, not just in Notes. Tasks, Exams, and every other module support it too.

## Mention Labels

A mention is a link whose label is the entity's title when it was written. Renaming any entity rewrites the labels that still show its old title (or "Untitled Note" and the like, when it had none) in every page block, inside the rename. A label the author changed is left alone.

## Find in Page

`Cmd+F` opens a find and replace bar at the top right of a page: selected text starts the search, Enter and Shift+Enter step through the matches and select them, and toggles switch match case, whole word and regular expressions (`$1` in the replacement). Select All Occurrences puts a caret in every match to type over them together.

## Quick Filters

The Notes and Jots pages keep favorite filters per page and Space. The star on a filter chip adds that filter to the bar beside the search field, where one click turns it on or off.

## Layout Direction

A full-width document canvas. The writing surface never uses a list plus detail pane split. The page itself is the canvas.

## Creation UX

A new Note drops the user straight into the canvas with the cursor focused and ready to type. The title comes first and content follows immediately. There is no intermediate form.

## Spell Checker

Off until the user turns it on: the update that adds it asks once, in a dialog that has no way out but a choice, and Settings under Editor holds the switch and the languages (`notes.spellcheck`, `notes.spellcheckLanguages`). The user's own words are kept in `dictionary.json` in the app data folder (`{ "words": [...] }`), a plain file Settings opens with Show dictionary file. Nookly adds to it from Add to Dictionary, reads it again when the window comes back, and never replaces a file it cannot read. Misspelled words get a wavy underline while typing, and a right click offers corrections, Ignore Spelling and Add to Dictionary. Several languages can be on at once, and a word is right when it is right in any of them, so a page that mixes languages needs no switching.

Hunspell dictionaries (`src-tauri/dictionaries`, see its README for the licenses) are read by the `spellbook` crate (`src/spelling.rs`), which knows compound words, and a language is read only when it is on. Code blocks, inline code, links, mentions, formulas, numbers, acronyms and addresses are never checked. A text block is read again only when it changed, each word is asked about once, and the word being typed is left alone until the cursor moves on (`features/spellcheck`). Nothing is checked while it is off, and a failure of the checker never turns into underlines.
