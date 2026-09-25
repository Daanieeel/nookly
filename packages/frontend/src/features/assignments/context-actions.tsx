import { type EntityRecord, registerEntityType } from "#/components/context-menu/registry.ts";

// An Assignment belongs to one Course and moves together with it.
registerEntityType<EntityRecord>({
  types: ["assignment"],
  omit: ["move"],
});
