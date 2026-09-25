# UI/UX Direction

Everything is built on the existing primitive component library and Tailwind design system in `@nookly/ui` (`packages/ui`), both of which are frozen. Never modify a primitive. Compose primitives or add new components alongside them.

## Visual Reference

Treat Linear desktop, Notion desktop, the Vercel dashboard, and the Supabase dashboard as the north star.

- Dense but calm: never cramped and never sparse. Density comes from row height and hierarchy, not from cramming.
- Subtle borders and elevation instead of heavy boxes and shadows.
- A muted, neutral base. Color is used sparingly and on purpose, for accents and status.

## Visual Tone

Dense and utilitarian: compact, high information density, little whitespace, built for speed and keyboard use. The existing primitives already look this way.

## Color Theme

Dark and light themes are both fully supported and equally important. The primitives and Tailwind config already handle both.

## Space Color Bleed

The active Space's accent color shows up beyond its sidebar label, in highlights, accents, and tinting throughout that Space (see [Spaces](04-navigation-spaces.md#spaces)).

## Remembered Customizations

Layout and view choices the user makes, such as collapsing or resizing a sidebar, the theme, or the last active Space, are remembered across sessions and restarts. The app reopens the way the user left it. These preferences are stored per device and are not synced. See [Preference Keys](development/preference-keys.md) for the keys and the rules for adding new ones.

## Command Palette

Foundational and required for v1.

- `Cmd+K`: quick navigation, quick create, and quick search (backed by full-text search).
- `Cmd+P`: quick open, to jump to any item in the style of Linear or VS Code.

## Component Philosophy

Default to bespoke components that understand their content instead of generic form controls. Compose them from existing primitives or add them alongside. Never replace a primitive.

## Success and Error Feedback

Show the result of an action on the element the user interacted with. Their attention is already there, so the answer belongs there too. Toasts are a fallback for the rare case where that is not possible, never the default.

### In Place First

- **Success:** the control confirms itself briefly, then returns to its resting state. A button swaps its icon for a green check, a row gets a subtle highlight, a field settles back quietly after saving.
- **Error:** the control itself looks like it failed. An icon turns into a red warning, a field gets a destructive border with a short message directly below it, a row that failed to save stays marked.
- **Pending:** if an action takes noticeable time, the same control shows a spinner or a disabled state, so the user never wonders whether the click registered.
- **Dialogs and menus:** do not close the moment the user confirms. Keep the dialog open while the action runs and show the pending state on the button that was clicked. Close it as soon as the action succeeds; the closing itself confirms success, so no extra success state is shown. On error, keep the dialog open with the error on that button or field. If a native OS dialog is involved (such as a save dialog), the control that opened it carries the pending state, and the menu or dialog around it closes on success.
- **Timing:** success states revert on their own after about two seconds. Error states stay until the user acts again or the cause is resolved. An error that disappears by itself is an error the user missed.
- **Stable footprint:** swap icons, colors, or labels inside the existing box. Never shift the surrounding layout to make room for feedback.
- **Tokens:** `text-positive` for success, `text-caution` for warnings that need attention but are not failures, the `destructive` tokens for errors. Color is never the only signal; always pair it with an icon or label change so the state reads without color.
- **Accessibility:** update the accessible name or use an `aria-live` region so screen readers hear the change too.

### Reference Implementation

[`packages/ui/src/components/copy-button.tsx`](../packages/ui/src/components/copy-button.tsx) is the model to follow. Clicking copies the value and swaps the copy icon for a green checkmark for two seconds, then reverts. No toast, no layout shift, no extra UI. Components that wrap it can react to the same state, like `CopyPageMarkdownItem` in `PageExportMenu.tsx`, which turns its whole menu label green and keeps the menu open so the confirmation is visible.

### When a Toast Is Acceptable

Use a toast only when no interacted component is left on screen to carry the result:

- The action removes the control that triggered it, such as deleting a row. Pair the toast with an Undo action where possible.
- The action completes after the user has navigated away from the view that started it, so the control is no longer mounted.
- The action had no visible control, such as a keyboard shortcut or a command palette command after the palette closed.
- The failure is not tied to any single component, such as the backend being unreachable.

When a toast is used, say exactly what happened and, for errors, what the user can do next. Never show a toast and an in place state for the same event.

---

# Redesign Directive

This applies to the current build and every future one.

## The Core Problem (do not repeat it)

Pages must **not** all look the same. The pattern of a generic input row, a button, and a plain list must not appear anywhere. It directly violates the bespoke UI principle.

## Layouts per Module

Look at the nature of the data (is it time-based, document-based, visual, driven by status?) and design the layout around it. The table below is guidance, not a complete list.

| Module             | Primary layout                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Tasks              | Board with Linear-style columns per status by default. Toggle to a list or table grouped by status, label, or date. |
| Notes              | Full-width document canvas. No list and detail split for the writing surface.                                       |
| Jots               | Fast, minimal capture surface with almost no chrome.                                                                |
| Courses            | Card grid or compact list showing name, semester chips, and sequel or prequel indicators.                           |
| Sessions/Timetable | Calendar first, using a weekly timetable grid. A list is secondary.                                                 |
| Exams              | Timeline or upcoming-first list, sorted by date, with urgency emphasized. Grade and status as badges.               |
| Decks              | Grid of deck piles, decks with cards to study first. A deck page is a writing desk and a study session.             |
| Assignments        | List that puts dates and status first. Visually distinct from Tasks despite the similarity.                         |
| Files              | Grid by default with file-type icons or thumbnails. List as a toggle.                                               |
| Bookmarks          | Grid of rich preview cards showing favicon, title, and preview image.                                               |
| Dashboard          | Flat sections on the page background, no cards. Wide windows put Today and Unrefined Jots side by side.             |

## Content-Aware Creation Flows (top redesign priority)

### General Principle

Creating something should feel deliberate and satisfying, like pressing C in Linear or clicking "+ New page" in Notion. It should never feel like filling out a bureaucratic form.

### Entry Points

Replace static input and button rows with:

- **Command palette creation** (`Cmd+K` or `Cmd+P`) with fuzzy type selection, so typing "new task" jumps straight into task creation.
- **Contextual "+" affordances** wherever creation makes sense. Hovering a status column adds a task with that status filled in; hovering a calendar day adds a session on that day.
- **A single, minimal "New" action** that floats or stays in place, like Linear's. Not an input bar fixed into the layout.

### Creation Surface per Type

- **New Task:** a lightweight, keyboard-first quick-create overlay with a title and inline pickers for status, label, and date. The user can create one after another without closing it.
- **New Note:** drops straight into the document canvas with the cursor focused. Title first, content immediately after. No intermediate form.
- **New Jot:** near instant. One keystroke or click from anywhere opens a blank capture surface with no friction.
- **New Session:** created directly in the calendar by clicking or dragging across a time slot. The calendar is the creation surface.
- **New Exam or Assignment:** ask for the one or two things that matter most first (the Course and the date). Leave grade and status for the detail view after creation.
- **New Bookmark:** starts from a pasted URL. Show a live preview of the fetched metadata (or an offline placeholder) the moment it is pasted.
- **New File:** drag and drop is the main way in, onto the Files grid or any entity's Attachments section. The file picker is a fallback.
- **New Space:** a short, visually engaging sequence for picking an icon, a color, and optionally a template. It should feel like a "make it yours" moment, not three plain text fields.

### Consistency Within Variety

- Always fully usable from the keyboard: Tab and Enter move through the flow, Escape cancels, and nothing requires a mouse.
- Give immediate visual feedback when something is created, such as a subtle animation or highlight on the new item. Never refresh the list silently.
- Show at most two or three fields before the user can submit. Needing more is a design error; move the rest to the detail view.

## Consistent Component Styling

**Guiding principle:** inputs, selects, and textareas are secondary to the actual content. Style them that way.

- Inputs, selects, and textareas should match `button-secondary`: same height, background, border, and corner radius.
- Save `button-primary` and other loud styles for real primary actions (confirming a creation, submitting a change, a destructive action). Never use them for routine data entry controls.
- Audit every input, select, and textarea. Align their height, background, and border with `button-secondary` so a row mixing inputs and buttons reads as one cohesive group.

Checks:

- A height mismatch between a button and the input next to it is a bug. Fix it everywhere it appears.
- An input should never be louder than the buttons around it (brighter background, harsher border). It should recede.
- If the primitive library lacks a shared size or tone token that both `button-secondary` and inputs can use, that is a real gap. Fix it at the token or primitive level by extending, not replacing, so the problem cannot come back page by page.

## Responsiveness

Nookly runs in a resizable desktop window, not a fixed canvas, so every view must adapt to any window size.

- At narrow widths the sidebar collapses to icons only or becomes toggleable.
- At narrow widths, list and table views reflow their columns or switch to a card layout. Do not fall back to clipping or horizontal scrolling.
- Nothing may assume a single fixed viewport size.

## Process Expectations

1. Do a full pass, not spot fixes. Every page that shares the generic layout template needs a redesign specific to its module.
2. Start with the sidebar. It is the most visibly broken part and the front door of the app.
3. Creation flows are the most valuable area. If time is short, prioritize them.
4. Never modify existing primitives or tokens. Compose them differently or add new bespoke components alongside them.
5. **Done check:** every page must be distinguishable from every other page at a glance, without reading any text. If two pages could be confused in a blurry screenshot, the work is not done.
