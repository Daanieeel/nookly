# Module: Files and Bookmarks

## Files (formerly Documents)

A full, first-class entity that participates in the relationship system like everything else.

**Storage:** files are copied into a local folder the app manages. The copy is fully independent of the original, so it stays predictable and portable and survives the user moving or deleting the source file.

**Files as links** (cloud documents such as a Google Doc or a Dropbox file) are provider-aware. Google Drive, Dropbox, and iCloud are detected and tagged specifically. Any other provider falls back to a generic URL field.

Reverse lookup for attachments is automatic because the relationship graph works in both directions (see [attachments](../02-entity-model.md#attachments-work-in-both-directions)). No extra modeling is needed.

## Bookmarks

A separate entity from files as links:

- A **file as link** is a document stored in the cloud and is treated as a document.
- A **Bookmark** is any webpage and is treated as a reference.

**Metadata:** when online, fetch the title, favicon, and preview image or description automatically. When offline, show a placeholder with an "added on [date]" timestamp, then fetch the metadata once the app is back online and cache it.

Bookmarks live inside a Space like any other page. They are not global.

## Layout Direction

**Files:** a grid by default, with file-type icons or thumbnails, like Finder or the Vercel asset view. A list view is available as a toggle but is never the default.

**Bookmarks:** a grid of rich preview cards showing favicon, title, and preview image. Not a plain list of links.

## Creation UX

**Files:** drag and drop is the main way in, either onto the Files grid or straight onto any entity's Attachments section. The standard file picker is only a fallback.

**Bookmarks:** start from a pasted URL. The moment a URL is pasted, show a live preview of the fetched metadata (or the offline placeholder) as confirmation.
