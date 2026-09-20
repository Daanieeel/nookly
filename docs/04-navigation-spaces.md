# Navigation & Spaces

## Spaces

Renamed from "Environments." Notion-teamspace-like groupings in sidebar (e.g. Work, Private, Study).

Flat, non-nestable. Every entity belongs to exactly ONE Space. No exceptions, no sub-spaces.

Spaces are a hard wall. No cross-Space browsing/filtering/global-per-module-view by default (no "all Tasks across all Spaces" list). Matches Notion behavior exactly.

Fields: name, icon, color.
Icon and color are independently configurable (user picks icon separately from accent color).
Space icon renders in Space's own accent color — this is the ONE exception to the neutral-icon-fallback rule (see 02).

Unlimited, user-created. Created via sidebar "+". Can start from lightweight template. Templates are community-extendable, same as modules.

Spaces contain only pages/entities. No per-Space module enable/disable config (module config always global, see 01).

Space color bleeds into UI beyond sidebar label: active-state highlights, accent borders/buttons, subtle tinting when that Space is active.

## Sidebar Structure (locked visual spec)

- Flat list under each Space. NO sub-grouping/category headers ("Personal," "Study," etc). Remove entirely.
- Only show modules/pages actually in use within that Space. Don't render every available module type by default. Rows appear dynamically as content is created, or module explicitly added via ghost "+".
- Fixed cross-Space entries above Spaces list: Dashboard, Pinned, Search.
- Trash, System pinned at bottom. Visually quieter/muted/smaller than main content — utility, not content.
- Ghost "+" per Space (hover-revealed, not permanent bold element) to add new modules/pages to that Space.
- Global "Spaces" section header keeps its own "+" for creating new Space. Same ghost/subtle treatment, not a bold boxed button.

## Icons (sidebar + everywhere)

Notion-style, per-item, user-chosen (emoji or icon-lib icon), full color.
No icon chosen → fallback to entity-type default icon, rendered NEUTRAL/MUTED color. Never Space accent color.
Exception: Space's own icon = Space accent color (see above).

## Cross-Space Exceptions (exactly these four, no more without deliberate decision)

1. Dashboard — single, global, non-duplicable, bento-style customizable page. Content editable, page itself not duplicable. Future (out of scope now): per-Space dashboards, user-creatable.
2. Pinned — cross-Space section, individually pinned items, any entity type, top of sidebar.
3. Search — full-text, smart, spans entire app. Treated as utility, not a "view," so it ignores the Space hard wall.
4. Recents — cross-Space quick-access to the last few entities actually opened (any type, any Space), distinct from Pinned's manually-curated nature.

Any future cross-Space feature = added one at a time, deliberately. Not a general capability modules can opt into.
