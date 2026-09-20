# Core Philosophy

## Primitives Frozen

Component library + Tailwind design system already exist. Never edit existing primitives. Add new ones freely.

## Data Providers vs Viewers

Two module roles.

- Provider: owns schema/storage for an entity type.
- Viewer: renders a Provider's data.
  Both community-buildable. Multiple Viewers can exist per Provider. Installing Viewer auto-installs required Provider(s), resolved at build-config time (see 06, compile-time modules decision).

## Opinionated, Not Flexible

Many specialized, constrained page types. Not one flexible canvas (anti-Notion). Inspired by Jira/Linear. Breadth comes from many modules, not from config options per module.

## Bespoke UI Pillar

Every component should be purpose-built to its data. Not generic form controls. Applies everywhere, sidebar included. Equal priority to modularity, not secondary.

## Relationship System = Core Linking Mechanism

Pages don't nest. Every page belongs to exactly one Space. Cross-entity, cross-module, cross-Space linking happens via one relationship system only.

Properties:

- Directed. Always from → to. Inverse label auto-derived for display.
- Fixed enum of types. Core ships some. Modules can register new types at build time. Not freeform per-user strings.
- Unrestricted cardinality by default. Specific "structural" relationship types can enforce stricter rules (see 02).

Three sanctioned link mechanisms. No fourth allowed:

1. Relationships — formal typed graph.
2. Attachments — File/URL held by entity. Modeled as a relationship type, not separate engine.
3. Mentions — inline @mention in markdown. Contextual, unstructured.

Right sidebar section order (fixed): Relationships → Attachments → Mentioned.

## Cross-Space Relationships

Allowed freely. UI must visually flag when related item lives in a different Space than current view.

## Module Config = Always Global

Never per-Space. Spaces are folders only, not scoping boundaries.

## Compile-Time Modules

Modules = source code compiled into Tauri binary. "Install module" = add to build + recompile. No runtime plugin loading, no in-app marketplace. Future evolution, not now.
