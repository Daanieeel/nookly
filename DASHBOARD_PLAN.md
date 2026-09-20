# PLAN — Dashboard Narrative Briefing Banner

New feature: a "narrative UI" briefing sentence at the top of the Dashboard, above the bento-grid cards. Reads the day back to the user as flowing text with inline icons/pills, instead of another card/widget.

Read `04-navigation-spaces.md` (Dashboard section) and `05-ui-ux-direction.md` before implementing.

---

## 1. Concept

Replace "here's a grid of data" with "here's a sentence about your day," rendered as a calm typographic banner directly above the existing bento cards. This is a **deliberate, one-time visual exception** to the app's otherwise dense/utilitarian tone (see §5) — scoped to this single element, not a precedent for restyling other pages.

Example target output:

> Good morning — you've got 📅 **3 sessions** today starting with **Algorithms I** at 10am, ✅ **2 tasks** due before 5pm, and 📝 **4 unrefined jots** waiting.

## 2. Data Sources

Pulls from, across **all Spaces** (Dashboard is one of the three sanctioned cross-Space exceptions per `04-navigation-spaces.md` — this banner inherits that same cross-Space scope):

- **Sessions** — today's occurrences (see `03-modules/sessions-timetable.md`). Include start time + Course name of the earliest one.
- **Tasks** — open tasks with `due_date` = today or overdue. Count only; don't name individual tasks (avoid line getting long/noisy).
- **Exams / Assignments** — anything due/occurring today, or within the next 1–2 days if nothing is due exactly today (use judgment — "surface the nearest urgent thing" rather than only "today").
- **Jots** — count of unrefined Jots (no Refinement relationship yet), same definition as the sidebar badge in `PLAN.md` (sidebar upgrades) §1.

Soft-deleted entities are excluded from all counts (standard rule, `02-entity-model.md`).

## 3. Sentence Construction

This is **not** a single hardcoded string — it's assembled from a small set of composable clauses, since the number/combination of "things happening today" varies constantly. Build a lightweight template/clause system:

- **Greeting clause** (always present): time-of-day-aware — "Good morning" / "Good afternoon" / "Good evening", based on local system time.
- **Sessions clause** (conditional): included only if ≥1 Session today. Mentions count, and names the single earliest one with its time. If 0 sessions, this clause is omitted entirely — don't say "0 sessions."
- **Tasks clause** (conditional): included only if ≥1 open Task due today/overdue. States count only.
- **Exam/Assignment clause** (conditional): included only if something urgent exists within the lookahead window (§2). Names the item if there's exactly one; states count if multiple.
- **Jots clause** (conditional): included only if ≥1 unrefined Jot exists.

Join present clauses into one flowing sentence with natural connectors ("and", commas) — not a bullet list disguised as prose. Cap at **3 clauses maximum** in the sentence even if all four categories have data, to prevent run-on sentences; prioritize in this order when trimming: Sessions > Tasks > Exams/Assignments > Jots. (Reasoning: time-fixed commitments matter most for a "here's your day" framing; Jots are the most deferrable, mention last if room allows.)

## 4. Empty State

If literally nothing qualifies across all four sources: show a calm, positive empty-state line — not a broken/missing sentence, not "0 sessions, 0 tasks...". Something like:

> Good morning — nothing urgent on the horizon. A clean day.

Tone should stay consistent with the mascot/briefing voice, not feel like a generic "no data" placeholder (ties to the earlier empty-state principle: tell the user what's going on, don't just show blankness).

## 5. Visual Treatment

- **Deliberate exception to dense/utilitarian tone** for this element only. Calmer, more typographic: more line-height/breathing room than the rest of the app, a slightly larger font size than body text elsewhere.
- **Deliberate color exception, too.** This banner is already the one place allowed to break the dense/utilitarian tone (calmer typography, more breathing room) — extend that same exception to color. Inline glyphs may use actual emoji (📅 ✅ 📝) or colored icons, rather than being forced into the app's otherwise-monochrome icon system used elsewhere (sidebar, module rows, etc.). This is intentionally the one playful, colorful moment in an otherwise restrained app — don't normalize it elsewhere, but don't suppress it here either.
- **Bolded/pill-highlighted key nouns**: counts, times, and names (e.g. **3 sessions**, **10am**, **Algorithms I**) rendered with emphasis (bold weight, or a small pill/chip treatment) so the sentence is scannable without reading every word — eye should be able to jump pill to pill.
- Placement: full-width banner directly above the bento card grid on the Dashboard, visually separated by spacing (not a bordered card — this is prose, not a widget, and pairing it with the strict Card primitive treatment used elsewhere would undercut the "briefing" feel).
- No dark-background/serif-font special theming beyond what's described above — stay within the app's existing theme-agnostic light/dark tokens (`05-ui-ux-direction.md`), just apply the calmer typographic treatment on top of them, don't introduce a one-off color palette for this single element.

## 6. Mascot Integration

The same fixed-identity Blobatar mascot from the sidebar footer (see sidebar-upgrades `PLAN.md` §6) also appears here, so the briefing reads as the mascot speaking it — reinforcing one consistent character across the app rather than introducing a second one.

- **Same identity, same fixed name string** as the footer mascot — this must resolve to the identical Blobatar every time (not a new/different one for the Dashboard context).
- **No bordered box, no Card primitive here** — this is the opposite treatment from the footer instance. The footer mascot is deliberately wrapped in a `Card` (§6 of sidebar-upgrades `PLAN.md`); this Dashboard instance must NOT be boxed, bordered, or card-wrapped. The whole point of the calm typographic treatment (§5) is that it doesn't look like a widget — a visible container around it would undercut that. Mascot + sentence should sit directly on the Dashboard's background with only spacing/whitespace separating them from the bento cards below.
- **Placement**: mascot positioned beside (not above/below) the sentence — e.g. small, positioned at the start of the line or slightly above-left of the text block, similar to how a speaker's avatar sits next to a quote, but without a speech-bubble shape or outline around either element.
- **Idle animation carries over**: same always-on idle motion as the footer instance (§6 of sidebar-upgrades `PLAN.md`) — consistent behavior for the same character wherever it appears.
- **Expression**: if the footer mascot's optional `expression` prop (tied to daily completion ratio) was implemented, reuse the same live expression state here too, so the mascot's mood is consistent between the two places it appears in a single session — not two independently-computed expressions that could contradict each other.

## 7. Non-Goals

- **No weather.** Requires network access; app is offline-first. Do not add.
- **No AI-generated/LLM-composed sentence.** This should be deterministic template assembly from real data (§3), not a live-generated string — keeps it fast, offline-safe, and predictable.
- **Not a general "narrative UI" pattern for the rest of the app.** This is Dashboard-only. Do not apply this sentence-based treatment to Tasks, Notes, or any other module's layout.

## 8. Implementation Notes

- New, single-purpose component (per bespoke-UI pillar, `01-philosophy.md`) — e.g. `DashboardBriefing` — composed from existing tokens (icon set, text/pill primitives) but built as its own thing, not a repurposed Card or list primitive. Reuse the existing Blobatar mascot component/instance from the sidebar footer implementation rather than creating a second one — same fixed name prop, no `hue` override, differing only in the container styling (boxed vs. unboxed) between the two call sites.
- Sentence-clause data must be derived/computed on render (or reactive), same rule as sidebar badges in the sidebar-upgrades `PLAN.md` — no cached/stored "today's briefing" field.
- Time-of-day greeting boundaries: reasonable defaults — before 12:00 "Good morning", 12:00–17:59 "Good afternoon", 18:00+ "Good evening". Adjust if it feels off in practice; not a hard architectural requirement, just a sensible starting point.
