# Vision and Motivation

Use this file for judgment calls the other docs do not cover. It captures the reasoning behind Nookly, in the creator's own terms.

## Why This App Exists

Nookly is built first for one person, its creator, to organize their own life. It is open source so others can extend it for themselves, but "for me first" is the real design constraint, not "for everyone."

## Why Not Notion

Notion offers too many options, and that is overstimulating. With a blank, flexible canvas, every page means deciding its structure from scratch. That is a real cognitive cost, not a quirk of taste.

## Why the Jira and Linear Style

A large set of opinionated, constrained page types lets you stay inside clear boundaries and actually capture the thought or task, instead of getting distracted by options for structuring it. Constraint creates focus. With enough page types, there is plenty of expressive range without the overstimulation.

## Why Modularity Matters So Much

This comes from an IT and developer background. The core should stay small and stable, with specialized modules that each do one thing well, the same instinct behind Unix tools. The community should be able to build its own modules and viewers **without** touching or forking the core, so the public module set stays trustworthy and only ever grows.

## Why Sub-tasks Are Called Out

They are "missing in SO many todo apps." It is a recurring personal frustration with existing tools and an explicit emotional priority. Treat sub-task support as core, not as a nice-to-have.

## Why Bespoke UI Matters (the zip code example)

Fast, AI-assisted coding removes the old excuse for generic components built for reuse at all costs. A single-use, highly specific component, such as a zip code field that only accepts digits, shows a placeholder per digit, and detects the country, **feels** higher quality than a generic textarea even though it does less. It is cheap to build now, so there is no reason not to. This applies to the whole app, not just forms: the sidebar, the navigation, and everything else should feel designed for what it actually shows.

## Why Data Export and Markdown Matter So Much

The user wants to be confident their data is never trapped in the app. Markdown in particular, because it is the most durable, tool-agnostic format there is. They are willing to accept uglier exports in exchange for guaranteed completeness: correctness beats prettiness when exporting.

## Why Git Was Considered, Then Rejected

The first instinct, coming from IT, was to use git for transparency, rollback, and eventual publishing. During discussion a real concern came up: binary attachments would bloat a git repo quickly and make the approach impractical. The user chose to cut the scope entirely rather than solve the bloat problem now.

**For future agents:** do not casually bring git back as "an easy win." Dropping it was a deliberate reversal after real consideration, not an oversight.

## Why the Redesign Frustration Happened

The first draft built by an agent worked fine but looked generic. Every page used the same input row plus button layout, and the sidebar was cluttered with sub-group headers that did not match the user's mental model (which they showed with a screenshot of their old Notion sidebar).

The user could tell something was wrong but at first struggled to put it into words ("i dont really know how to even explain"). Take this as a signal: get visual and interaction quality right proactively, rather than waiting for precise complaints.

The references given were Linear desktop, Notion desktop, the Vercel dashboard, and the Supabase dashboard. Study them; do not guess.

## General Guidance for Agents

When these docs do not explicitly settle a design or architecture decision, prefer the option that:

1. Keeps the core small and modules additive-only.
2. Reduces visual and decision overstimulation for the user.
3. Treats complete markdown export as non-negotiable.
4. Makes each piece of UI feel designed for its exact content, not generic.
5. Does not casually bring back deferred scope (git, notifications, cloud sync, runtime plugins) as a "helpful" addition.
