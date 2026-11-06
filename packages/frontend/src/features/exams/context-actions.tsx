import { type EntityRecord, registerEntityType } from "#/components/context-menu/registry.ts";

// An Exam belongs to one Course and moves together with it, never on its own.
// Decks stand alone.
registerEntityType<EntityRecord>({
  types: ["exam"],
  omit: ["move"],
});
