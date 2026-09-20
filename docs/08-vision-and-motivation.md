# Vision & Motivation

Use this file for judgment calls not explicitly covered elsewhere. This is the "why" behind Nookly, in the user's own reasoning.

## Why This App Exists
Built primarily for one person (the creator) to organize their own life. Open source so others can extend it for themselves — but "for me first" is the actual design constraint, not "for everyone."

## Why Not Notion
Notion offers too many options. Overstimulating. Blank-canvas flexibility means every page requires deciding its own structure from scratch. This is a real cognitive cost, not a preference quirk.

## Why Jira/Linear Style Instead
A large set of highly opinionated, constrained page types lets someone stay within boundaries and actually capture the thought/task, instead of being distracted by structuring options. Constraint = focus. Enough page types = enough expressive range without the overstimulation.

## Why Modularity Matters So Much
Comes from IT/developer background. Wants the core to stay small and stable, with specialized modules doing one thing well — same instinct as Unix-philosophy tooling. Community should be able to build their own modules/viewers WITHOUT touching or forking the core, so the public module set stays trustworthy and additive-only forever.

## Why Sub-tasks Specifically Called Out
"Missing in SO many todo apps." A recurring personal frustration with existing tools. Explicit emotional priority — treat sub-task support as core, not a nice-to-have.

## Why Bespoke UI Matters (the zip-code example)
Fast AI-assisted coding removes the old excuse for generic, reusable-at-all-costs components. A single-use, highly specific component (e.g. a zip-code field that only accepts digits, shows digit placeholders, detects country) FEELS more high-quality than a generic textarea, even though it does less. Cheap to build now, so there's no reason not to. This applies to the whole app, not just forms — sidebar, navigation, everything should feel designed for what it actually shows.

## Why Data Export/Markdown Matters So Much
User wants confidence their data is never trapped in the app. Markdown specifically, because it's the most durable, tool-agnostic format available. Willing to accept uglier rendering on export as the tradeoff for guaranteed completeness — correctness over prettiness when exporting.

## Why Git Was Considered, Then Rejected
Initial instinct (IT background) was to use git for transparency, rollback, and eventual publishing. Real concern surfaced during discussion: binary file attachments would bloat a git repo fast, making the whole approach impractical. User chose to cut scope entirely rather than solve the bloat problem now. Message for future agents: don't casually reintroduce git as "an easy win" — this was a deliberate reversal after real consideration, not an oversight.

## Why the Redesign Frustration Happened
First agent-built draft was functionally fine but visually generic — same input-row-plus-button layout on every page, sidebar cluttered with sub-group headers not present in the user's actual mental model (shown via a real screenshot of their old Notion sidebar). The user could tell something was wrong but struggled to articulate it precisely at first ("i dont really know how to even explain") — this is a signal that visual/interaction quality is something to proactively get right, not just wait for precise complaints about. Reference points given: Linear desktop, Notion desktop, Vercel dashboard, Supabase dashboard — study these, don't guess.

## General Tone for Agents
When a design or architecture decision isn't explicitly specified in these docs, prefer the choice that:
1. Keeps the core small and the module additive-only.
2. Reduces visual/decision overstimulation for the end user.
3. Treats markdown/export completeness as non-negotiable.
4. Makes the specific piece of UI feel designed for its exact content, not generic.
5. Does not casually reintroduce deferred scope (git, notifications, cloud sync, runtime plugins) as a "helpful" addition.
