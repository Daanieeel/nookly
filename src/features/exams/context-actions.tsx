import { type EntityRecord, registerEntityType } from "@/components/context-menu/registry";

// An Exam belongs to one Course, and its Decks and Study Blocks to one Exam; each
// moves together with what it belongs to, never on its own.
registerEntityType<EntityRecord>({
  types: ["exam", "index_card_deck", "study_block"],
  omit: ["move"],
});
