# Module: Files & Bookmarks

## Files (renamed from Documents)

Full first-class entity. Participates in relationship system like everything else.

Storage: files copied into app-managed local storage folder. Fully decoupled from original source location on disk. Predictable, portable, survives user moving/deleting original.

Files-as-links (cloud docs, e.g. Google Doc, Dropbox file): provider-aware. Detects/tags Google Drive, Dropbox, iCloud specifically. Generic URL field = fallback for unrecognized providers.

Attachment reverse-lookup is automatic (bidirectional via relationship graph, see 02). No extra modeling needed.

## URLs / Bookmarks

New entity. Distinct from Files-as-links:

- Files-as-links = cloud-storage documents, treated as a document.
- URL/Bookmark = arbitrary webpage, treated as a reference/link.

Metadata: auto-fetch title, favicon, preview image/description when online.
Offline: show placeholder + "added on [date]" timestamp. Fetch metadata opportunistically once online, cache for later.

Lives inside a Space like any other page. Not global/Space-independent.

## Layout Direction (UI)

Files: grid view default, file-type icons/thumbnails (Finder-style / Vercel asset view). List view = toggle option, not default.
Bookmarks: rich preview cards (favicon, title, preview image) in a grid. Not a plain link list.

## Creation UX

Files: drag-and-drop primary method (onto Files grid, or onto any entity's Attachments section directly). Traditional file picker = fallback only.
Bookmarks: paste-URL-first flow. Moment URL is pasted, show live preview of fetched metadata (or offline placeholder) as confirmation.
