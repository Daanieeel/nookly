# Navigation and Spaces

## Spaces

Formerly called "Environments." Spaces are groupings in the sidebar, similar to Notion teamspaces (for example Work, Private, Study).

Spaces are flat and cannot be nested. Every entity belongs to exactly **one** Space, with no exceptions and no sub-spaces.

Spaces are a hard wall. By default there is no browsing, filtering, or module view across Spaces, so there is no "all Tasks in every Space" list. This matches how Notion behaves.

**Fields:** name, icon, and color. The user picks the icon and the accent color separately. A Space's icon renders in its own accent color, which is the **one** exception to the neutral fallback icon rule (see [base fields](02-entity-model.md#base-fields)).

The user can create as many Spaces as they like using the "+" in the sidebar. A new Space can start from a lightweight template, and the community can contribute templates the same way it contributes modules.

Spaces only contain pages and entities. Modules cannot be enabled or disabled per Space, because module config is always global (see [philosophy](01-philosophy.md#module-config-is-always-global)).

The active Space's color carries into the UI beyond its sidebar label: active state highlights, accent borders and buttons, and a subtle tint across its views.

## Sidebar Structure (locked visual spec)

- Each Space shows a flat list. There are **no** sub-groups or category headers such as "Personal" or "Study." Remove them entirely.
- Only show the modules and pages a Space actually uses. Do not list every available module type by default. Rows appear as content is created, or when a module is added explicitly through the ghost "+".
- Dashboard, Pinned, and Search sit in a fixed block above the list of Spaces, since they span all Spaces.
- Trash and System are pinned to the bottom. They look quieter than the main content (muted and smaller) because they are utilities, not content.
- Each Space has a ghost "+" that appears on hover, for adding modules or pages to that Space. It is not a permanent, bold element.
- The global "Spaces" header keeps its own "+" for creating a new Space. It gets the same subtle ghost treatment, not a bold boxed button.

## Icons (sidebar and everywhere else)

Icons work like Notion: each item can have its own user-chosen icon (an emoji or an icon library icon) in full color.

When no icon is chosen, the item falls back to its entity type's default icon, rendered in a **neutral, muted** color and never in the Space accent color. The one exception is a Space's own icon, which uses the Space accent color (see above).

## Cross-Space Exceptions

There are exactly six. Adding another requires a deliberate decision.

1. **Dashboard:** a single, global page of flat sections. Its content is editable, but the page itself cannot be duplicated. Per-Space and user-created dashboards may come later, but are out of scope for now.
2. **Calendar:** a unified calendar layering the external calendar overlay, every Space's Sessions, and every Space's Calendar entries into one view, positioned directly below Dashboard. Sessions and Calendar entries render in their origin Space's accent color and are editable in place; the external overlay stays read only. It does not replace either module's own per-Space calendar.
3. **Pinned:** a section at the top of the sidebar holding individually pinned items of any type from any Space.
4. **Search:** smart, full-text search across the whole app. It counts as a utility rather than a view, so it ignores the Space wall.
5. **Recents:** quick access to the last few entities actually opened, of any type and from any Space. Unlike Pinned, it is automatic rather than curated by hand. It lives in the `Cmd+K` palette only; there is no Recents page.
6. **Assistant:** the in-app AI assistant's own page, positioned directly below Calendar. It works across every Space; anything it creates lands in the Space the user picks in the moment, defaulting to the most recently active one. It has no per-Space view of its own, since a conversation is not scoped to one Space any more than Search is.

Any future cross-Space feature must be added individually and deliberately. It is not a general capability modules can opt into.
