# Module: Notes / Pages

Notion-style block-based editor.

## Blocks

True block model. Each block independently addressable, reorderable, relatable (see 02, block-level addressability).
Every block type (standard or custom) MUST implement markdown-serialization method. Guarantees full-page plain-markdown export always works, even for custom blocks. Export completeness > export prettiness.

## v1 Scope

Ship standard blocks only: paragraph, headings, lists, code, quote, table, image, embed.
Custom block architecture built extensible, but actual custom blocks = future module-extension point. Not built now.

## Universal Markdown

Custom markdown available everywhere free text exists app-wide, not just Notes (Tasks, Exams, etc. too).

## Layout Direction (UI)

Full-width document canvas. No sidebar-list-plus-detail-pane split for writing surface. Page IS the canvas.

## Creation UX

New Note drops user straight into canvas, cursor focused, ready to type. Title-first, content-immediate. No intermediate form step.
