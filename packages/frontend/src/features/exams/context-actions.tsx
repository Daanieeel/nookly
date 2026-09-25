import { type EntityRecord, registerEntityType } from "#/components/context-menu/registry.ts";

// An Exam belongs to one Course, and its Study Blocks to one Exam; each moves
// together with what it belongs to, never on its own. Decks stand alone.
registerEntityType<EntityRecord>({
  types: ["exam", "study_block"],
  omit: ["move"],
});
