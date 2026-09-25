# Core Philosophy

## Primitives Are Frozen

The component library and Tailwind design system already exist in `@nookly/ui` (`packages/ui`). Never edit an existing primitive. Adding new ones is always fine.

## Data Providers and Viewers

A module plays one of two roles:

- **Provider:** owns the schema and storage for an entity type.
- **Viewer:** renders a Provider's data.

The community can build both. A single Provider can have many Viewers. Installing a Viewer automatically installs the Providers it needs, resolved when the build is configured (see [compile-time modules](06-decisions-log.md#modules-are-packaged-at-compile-time-not-loaded-as-runtime-plugins)).

## Opinionated, Not Flexible

Nookly offers many specialized, constrained page types instead of one flexible canvas. It is deliberately the opposite of Notion and takes its cues from Jira and Linear. Breadth comes from adding more modules, not from adding config options to each module.

## Bespoke UI

Every component should be built for the data it shows, not assembled from generic form controls. This applies everywhere, the sidebar included. Bespoke UI is as important as modularity, not secondary to it.

## The Relationship System Links Everything

Pages do not nest, and every page belongs to exactly one Space. All linking, whether across entities, modules, or Spaces, goes through a single relationship system.

Relationships are:

- **Directed.** Every edge runs from one entity to another. The inverse label is derived automatically for display.
- **Typed from a fixed enum.** Core ships a set of types, and modules can register more at build time. Users cannot create freeform relationship strings.
- **Unrestricted in cardinality by default.** Specific structural relationship types can enforce stricter rules (see [structural relationships](02-entity-model.md#structural-relationships)).

There are exactly three sanctioned ways to link things. Do not add a fourth.

1. **Relationships:** the formal, typed graph.
2. **Attachments:** a File or URL held by an entity. Modeled as a relationship type, not a separate engine.
3. **Mentions:** an inline @mention in markdown. Contextual and unstructured, kept outside the formal graph.

The right sidebar always shows these sections in this order: Relationships, Attachments, Mentioned, Mentioned in. Mentioned in lists the pages whose content mentions this entity, read from a backlink index that is rebuilt whenever a page's content changes.

## Cross-Space Relationships

Relationships may freely cross Spaces. The UI must visibly flag any related item that lives in a different Space than the one being viewed.

## Module Config Is Always Global

Config is never set per Space. Spaces are folders, not scoping boundaries.

## Compile-Time Modules

Modules are source code compiled into the Tauri binary. Installing a module means adding it to the build and recompiling. There is no runtime plugin loading and no in-app marketplace. Those may come later, but not now.
