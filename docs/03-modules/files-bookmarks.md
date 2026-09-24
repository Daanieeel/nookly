# Module: Files and Bookmarks

## Files (formerly Documents)

A full, first-class entity that participates in the relationship system like everything else.

**Storage:** files are copied into a local folder the app manages. The copy is fully independent of the original, so it stays predictable and portable and survives the user moving or deleting the source file. The exception is a path typed or pasted into the Files bar: that file is referenced where it lives, and "Copy into Nookly" makes it independent later. A pasted link is downloaded into storage; a link that turns out to be a webpage is offered as a Bookmark instead, and a File that came from a link can be converted into one. A stored file can be replaced by a newer version, keeping the same entity; there is no version history.

**Files from links** (cloud documents such as a Google Doc or a Dropbox file) are provider-aware. Google Drive, Docs and Dropbox share links are rewritten to their direct download (Docs, Sheets and Slides as PDF) and the provider is tagged; the source URL is kept.

Reverse lookup for attachments is automatic because the relationship graph works in both directions (see [attachments](../02-entity-model.md#attachments-work-in-both-directions)). No extra modeling is needed.

## Bookmarks

A separate entity from files as links:

- A **file as link** is a document stored in the cloud and is treated as a document.
- A **Bookmark** is any webpage and is treated as a reference.

**Metadata:** when online, fetch the title, favicon, and preview image or description automatically. The main preview is a local snapshot of the page itself, rendered off screen (macOS only so far); the page's `og:image` stands in while it is captured or when capture fails. When offline, show a placeholder with an "added on [date]" timestamp, then fetch the metadata once the app is back online and cache it.

Bookmarks live inside a Space like any other page. They are not global.

## Layout Direction

**Files:** a grid by default, with file-type icons or thumbnails, like Finder or the Vercel asset view. A list view is available as a toggle but is never the default.

**Bookmarks:** a grid of rich preview cards showing favicon, title, and preview image. Not a plain list of links.

## Creation UX

**Files:** drag and drop is the main way in, either onto the Files grid or straight onto any entity's Attachments section. The standard file picker is only a fallback.

**Bookmarks:** start from a pasted URL. The moment a URL is pasted, show a live preview of the fetched metadata (or the offline placeholder) as confirmation.
