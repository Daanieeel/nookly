# UI/UX Direction

Built on existing, frozen primitive component library + Tailwind design system. Never modify primitives. Compose or add new ones alongside.

## Visual Reference

Linear desktop, Notion desktop, Vercel dashboard, Supabase dashboard. Use as north star.
Dense but calm. Never cramped, never sparse. Density from row height/hierarchy, not cramming.
Subtle borders/elevation, not heavy boxes/shadows.
Muted neutral base. Color used sparingly, intentionally (accents, status).

## Visual Tone

Dense/utilitarian. Compact, high info density, minimal whitespace, built for speed/keyboard use. Matches existing primitive styling already.

## Color Theme

Theme-agnostic. Dark and light both fully supported, equally primary. Already supported by primitives/Tailwind config.

## Space Color Bleed

Active Space's accent color visible beyond sidebar label: highlights, accents, tinting throughout that Space's context.

## Command Palette

Foundational, must-have, v1.
`Cmd+K` — quick nav, quick-create, quick-search (tied to full-text search).
`Cmd+P` — quick-open/jump-to (Linear/VSCode-style).

## Component Philosophy

Default to bespoke, content-aware components over generic form controls. Compose from or add alongside existing primitives. Never replace.

---

# Redesign Directive (applies to current + all future builds)

## The Core Problem (do not repeat this mistake)

Every page must NOT look the same. No "generic input row + button + plain list" pattern anywhere. This violates bespoke-UI pillar directly.

## Layout Differentiation Table

Look at data's nature (time-based? document-based? visual/media-based? status-driven?) and design layout around that. Table below = guidance, not exhaustive:

| Module             | Primary Layout                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| Tasks              | Board (Linear-style columns by status) default. List/table toggle, grouped by status/label/date. |
| Notes/Pages        | Full-width document canvas. No list+detail split for writing surface.                            |
| Jots               | Fast, minimal, near-zero-chrome capture surface.                                                 |
| Refinements        | Same canvas as Notes.                                                                            |
| Courses            | Card-grid or compact list. Name, semester chips, sequel/prequel indicators.                      |
| Sessions/Timetable | Calendar/timetable-first (weekly grid). List = secondary.                                        |
| Exams              | Timeline/upcoming-first list, sorted by date, urgency-emphasized. Grade/status = visual badge.   |
| Assignments        | Date-forward, status-forward list. Visually distinct from Tasks despite similarity.              |
| Files              | Grid view default, file-type icons/thumbnails. List = toggle.                                    |
| Bookmarks          | Rich preview cards (favicon, title, preview image), grid layout.                                 |
| Dashboard          | Bento-grid, non-uniform block sizes. Reads as "dashboard," distinct from list-based pages.       |

## Content-Aware "Add New" Workflows (highest-priority redesign area)

### General Principle

Creation should feel deliberate, satisfying. Like Linear's "press C" or Notion's "+ New page." Never a bureaucratic form.

### Entry Points

Replace static input+button rows with:

- Command palette creation (Cmd+K/Cmd+P), fuzzy type selection ("new task" jumps to task creation).
- Contextual "+" affordances where creation makes sense (hover status column → add with status pre-filled; hover calendar day → add session on that day).
- Single minimal floating/persistent "New" action (Linear-style), not a fixed input bar baked into layout.

### Creation Surface — per type examples

- New Task: lightweight keyboard-first quick-create overlay. Title + inline status/label/date pickers. Support create-then-immediately-create-another without closing.
- New Note/Page: drop straight into document canvas, cursor focused. Title-first, content-immediate. No intermediate form.
- New Jot: near-instant. One keystroke/click from anywhere → blank capture surface, zero friction.
- New Session: created from calendar view directly (click/drag time slot). Calendar IS the creation surface.
- New Exam/Assignment: ask for the 1-2 things that matter most first (Course, date). Defer grade/status to post-creation detail view.
- New Bookmark: paste-URL-first. Live preview of fetched metadata (or offline placeholder) immediately on paste.
- New File: drag-and-drop primary (onto Files grid or any entity's Attachments section). File picker = fallback.
- New Space: walk through icon + color + optional template as small, visually engaging sequence. "Make it yours" moment, not 3 plain text fields.

### Consistency Within Variety

- Fast keyboard accessibility always (Tab/Enter flow, Escape to cancel, no mouse-required paths).
- Immediate visual feedback on creation (subtle animation/highlight on new item). No silent list refresh.
- Max 2-3 visible fields before submit allowed. More than that = wrong, defer rest to post-creation detail view.

## Component-Level Styling Consistency

Governing principle: inputs/selects/textareas are SECONDARY information relative to actual content. Style them accordingly.

- Inputs, selects, textareas should visually match `button-secondary` styling: same height, background, border, corner radius.
- Reserve `button-primary` / louder visual weight for actual primary actions (confirm creation, submit change, destructive action). Not for routine data entry controls.
- Audit every input/select/textarea usage. Align height/background/border with `button-secondary` so mixed rows (input + button) read as one cohesive cluster.

Checks:

- Height mismatch between button and adjacent input = bug, fix everywhere it occurs.
- Input should never be visually louder (brighter bg, harsher border) than surrounding buttons. Should recede.
- If primitive library lacks shared sizing/tone token used by both button-secondary and inputs, that's a real gap — fix at token/primitive level (extend, don't replace) so this can't recur page by page.

## Responsiveness

Every view adapts across window sizes (resizable desktop window, not fixed canvas).
Sidebar collapses to icons-only or toggleable at narrow widths.
List/table views reflow columns or switch to card layout at narrow widths. Don't default to clipping/horizontal scroll.
Nothing assumes single fixed viewport size.

## Process Expectations

1. Full pass, not spot-fix. Every page sharing generic layout template needs module-specific redesign.
2. Sidebar first — most visibly broken, app's front door.
3. "Add new" flows = highest-value area. Prioritize here if time constrained.
4. Never modify existing primitives/tokens. Compose differently or add new bespoke components alongside.
5. Done-check: every page visually distinguishable from every other page at a glance, no text needed. If two pages could be mistaken from a blurry screenshot, not done.
