# PLAN.md — Sidebar Upgrades

Five approved sidebar features, to be implemented together as one sidebar-upgrade pass. Builds on existing docs in `/docs/nookly/`. Read `04-navigation-spaces.md` and `05-ui-ux-direction.md` before starting.

Do not modify existing primitive components or design tokens. New sidebar sub-components are additive.

---

## 0. Scope Summary

| # | Feature | Type |
|---|---|---|
| 1 | Live Counters & Ambient Status Badges | Per-module metadata, no new nav concept |
| 2 | Expandable Entity Rows (trimmed) | Reveals real entities under a module row |
| 3 | Recents | **New cross-Space sidebar exception** — requires doc update |
| 5 | Quick-Capture Jot Input | Implements existing "near-instant Jot" requirement |
| 6 | Blobatar Footer Assistant | Environmental context, delivered by a cute mascot |

Build order recommendation: **1 → 5 → 2 → 6 → 3**. Reasoning: 1 and 5 are pure additive polish with zero architectural risk, ship first. 2 is additive but touches sidebar tree rendering logic, do after. 6 is isolated (footer only, no interaction with rest of sidebar tree). 3 requires a docs decision to be finalized first (see §3) — build last so it doesn't block the others.

---

## 1. Live Counters & Ambient Status Badges ("The Pulse")

### Goal
Sidebar module rows show muted, context-aware metadata instead of being plain labels. Glanceable attention cues without opening the module.

### Per-Module Spec

**Tasks**
- Muted numeric badge = count of open (non-Done-status) Tasks in that Space.
- If any open Task has `due_date` <= today: render a small accent-colored dot on the badge (not a separate element — a dot overlay/corner mark on the existing count badge).
- Badge hidden entirely if count is 0 (per existing rule: don't show rows/indicators for unused content).

**Jots**
- Badge = count of Jots with no related Refinement yet (i.e., no outgoing `relates-to`/similar relationship targeting a Refinement entity).
- Once a Jot gets its Refinement relationship, it drops out of this count immediately (reactive, not on-page-load only).
- Style: subtle pill, same visual family as Tasks badge but never accent-dotted (no "urgency" concept for Jots).

**Exams / Assignments**
- Inline urgency chip showing relative countdown to the nearest upcoming date: `2d`, or absolute date (`Oct 14`) if beyond a threshold (suggest >7 days → absolute date, <=7 days → relative "Nd").
- Only the single nearest upcoming item's countdown shows at the module-row level. (Full list visible on entering the module itself.)

**Index Card Decks**
- Badge = count of cards due today per spaced-repetition schedule (see `03-modules/exam-tracking.md`).
- Same visual pill treatment as Jots badge (informational, not urgency-colored) unless overdue cards exist, in which case use the same accent-dot treatment as Tasks.

### Implementation Notes
- All counts must be **derived/computed, not stored fields** — query on render / reactive subscription, not a cached counter column, to avoid sync bugs.
- Badge components are new, single-purpose primitives (per bespoke-UI pillar) — do not repurpose a generic "Badge" primitive if one exists with different visual intent; create `SidebarCountBadge`, `SidebarUrgencyChip` etc. as needed, composed from existing tokens.
- Reduced-opacity soft-delete rule still applies: soft-deleted Tasks/Jots/etc. never count toward these badges.

---

## 2. Expandable Entity Rows

### Goal
Sidebar rows for entity-holding modules (Courses, Notes, etc.) can expand to reveal actual entities, not just the module name. Makes the app feel inhabited, reduces click-through depth.

### Explicitly In Scope
- **Courses**: expanding reveals the Space's active courses (e.g. `CS101`, `Linear Algebra`), each with its own icon (custom, or Blobatar fallback — see §5). Clicking jumps directly into that Course's detail view.
- **Notes**: expanding reveals the 3–5 most recently edited Notes in that Space.
- General mechanism: any module row MAY declare itself "expandable" and supply a short list of child entities to render indented beneath it, collapsed by default.

### Explicitly Out of Scope (do not build now)
- **Smart filter rows** (e.g. "Today", "Backlog", "This Week" under Tasks). This is a saved-view/filter concept not yet modeled anywhere in the data model. Revisit only after the Tasks board view has shipped and real usage shows the need. Do not add filter sub-rows in this pass.

### Behavior
- Expand/collapse state persists per module row (per session at minimum; per-user-preference persistence is a nice-to-have, not required for v1 of this feature).
- Expanded child rows use the same flat-row visual treatment as top-level sidebar items — no additional nested indentation styling beyond one level, no further expansion within an expanded row (one level deep only, avoids infinite-nesting complexity).
- Row limit per module: cap displayed children (suggest 5) with a "show more →" affordance that navigates into the full module view rather than expanding the list infinitely inline.

---

## 3. Recents

### ⚠️ Pre-requisite: Docs Update Required First
This is a **new, deliberate exception** to the Space hard wall. `04-navigation-spaces.md` currently states exactly three cross-Space exceptions exist (Dashboard, Pinned, Search) and that any future one must be added "one at a time, deliberately." This plan constitutes that deliberate addition.

**Before implementing:** update `04-navigation-spaces.md` §"Cross-Space Exceptions" to add Recents as the fourth sanctioned exception, and add a corresponding entry to `06-decisions-log.md` recording this decision and its rationale (cross-Space quick-access to actually-used items, distinct from Pinned's manually-curated nature).

### Goal
Fast return to the last few things actually opened, without drilling back through Space → module → entity every time.

### Spec
- Collapsible section, placed directly below Pinned, above the Spaces list.
- Holds last 4–5 entities opened (any entity type, any Space), most-recent-first.
- Each row: entity icon (or Blobatar fallback), title, and a small Space-color pip indicating origin Space (same cross-Space visual-indicator pattern used elsewhere per `01-philosophy.md` §Cross-Space Relationships).
- "Opened" = user navigated into the entity's detail view. Does not count: appearing in a list, being referenced/mentioned, hover previews.
- Deduplicate: reopening an already-recent item moves it to the top rather than creating a duplicate row.
- Recents list is **not persisted as its own entity** — it's a lightweight, locally-tracked navigation-history list (e.g. last N entity IDs + timestamps in local app state/settings), not part of the relationship graph.
- Soft-deleted entities: if a Recent entity gets soft-deleted, it either drops out of Recents immediately or renders at reduced opacity consistent with the soft-delete rule elsewhere — pick reduced-opacity for consistency with the rest of the app rather than inventing a special case.

---

## 5. Quick-Capture Jot Input

### Goal
Fulfill the already-locked requirement ("New Jot must be near-instant, zero friction") by docking a capture surface directly in the sidebar.

### Spec
- Discreet trigger in the sidebar header area (or top of Pinned section) — collapsed by default as a small icon/affordance, not a permanently-open input field taking up sidebar space.
- Clicking/triggering (also bindable via command palette, see `05-ui-ux-direction.md` Cmd+K) expands a minimal single-line (or lightly expandable) input inline in the sidebar.
- Typing + Enter → creates a new Jot immediately in the **active Space's** context, with the input as the Jot's initial content. Input clears, collapses back down. No navigation away from current view, no modal, no confirmation step.
- Escape cancels without creating anything.
- This is explicitly NOT the full Jot editing surface (`03-modules/jots-refinements.md` "near-zero chrome capture surface") — that's the destination once a Jot exists. This sidebar input is the *entry point*, optimized purely for zero-friction capture of a single thought. Opening the created Jot afterward for further editing is a separate, optional action (e.g. clicking the just-created Jot, which could surface briefly via a toast/inline confirmation).

### Secondary (lower priority, include only if time allows)
- Drag-and-drop target: dragging a file or link onto a Space or module row in the sidebar creates an attachment/bookmark immediately. Treat as a stretch goal for this pass, not a blocker — file/bookmark creation via drag-and-drop is already speced as the *primary* creation method for those modules in `05-ui-ux-direction.md`; this just extends that same drop behavior to sidebar targets specifically.

---

## 6. Blobatar Footer Assistant

### Goal
Blobatar is used in exactly one place: the sidebar footer, as a small recurring mascot character that "delivers" ambient environmental context — not as an icon system, not as an entity-fallback mechanism anywhere else in the app. This scope replaces any earlier idea of using Blobatar for entity/Space icon fallbacks — do not apply it there.

### Library
`blobatar` + framework adapter (e.g. `@blobatar/react`). MIT licensed, no dependencies, ~4.4KB gzipped. https://blobatar.dev

### Concept
The sidebar footer currently holds theme-toggle and system-level rows only. Replace/augment that footer with a single, fixed Blobatar character that acts as a quiet "assistant" presenting the environmental-context info that was originally proposed as plain footer text:
- Academic/life calendar context (e.g. `Week 6 · Autumn 2026`)
- Daily completion glance (e.g. `4/6 tasks done today`)
- Local-first system health indicator (e.g. `Local SQLite · All saved`)

Instead of three separate muted text rows, this info is framed as short lines the mascot "says" — e.g. rendered as a small speech-bubble/label next to or above the character, cycling or stacking these facts. The blob's `expression` prop can optionally reflect the day's state (e.g. `happy` when the daily task-completion ratio is high, neutral otherwise) — nice-to-have, not required for v1 of this feature.

### Identity
- Give the assistant a **fixed, unchanging name string** (e.g. `"nookly"` or similar constant) so it always renders the same Blobatar, every user, every session — this is a mascot, not a per-user or per-Space identity, so it must NOT be generated from the Space name, the user's name, or anything else that varies.
- No `hue` override needed — let the mascot have its own fixed look derived from its fixed name string.
- Static rendering is fine (no `animate` prop required); a subtle `animate="always"` idle motion is an acceptable nice-to-have for this one instance specifically, since it's a single fixed element rather than something repeated across a list (where animating many at once would be visual noise).

### Placement
- Bottom of sidebar, in the existing footer area, alongside (not replacing) the theme toggle and any other required system controls.
- Should be small and quiet by default — this is ambient charm, not a primary UI element. Should not compete visually with actual navigation.

### Where NOT To Apply
- Do not use Blobatar anywhere else: not for Space icons, not for Course icons, not for Bookmark fallbacks, not for Recents. All icon fallback behavior elsewhere in the app continues to use the existing neutral-default-icon system per `02-entity-model.md`. Blobatar in this plan is scoped to exactly one fixed footer element.

---

## Summary Checklist

- [ ] #1 Live counters/badges — Tasks, Jots, Exams/Assignments, Index Card decks
- [ ] #5 Quick-capture Jot input — sidebar trigger + inline create flow
- [ ] #2 Expandable rows — Courses, Notes (NOT smart filters — explicitly deferred)
- [ ] #6 Blobatar footer assistant — fixed-identity mascot in sidebar footer, delivering calendar/completion/system-health context
- [ ] #3 Recents — **update `04-navigation-spaces.md` + `06-decisions-log.md` first**, then implement collapsible section below Pinned