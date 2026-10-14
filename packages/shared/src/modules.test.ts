import { describe, expect, it } from "vitest";
import { MODULE_ENTITY_TYPES, isModuleKey, moduleForEntityType } from "./modules.ts";
import { DESKTOP_SCHEMA } from "./schema.ts";

describe("modules", () => {
  it("hold the same entity types as on the desktop", () => {
    // A type's first module is its own; the rest come along (a Course adds Semesters).
    for (const type of DESKTOP_SCHEMA.entityTypes) {
      const own = type.moduleKeys[0];
      if (!own) continue;
      expect(isModuleKey(own), own).toBe(true);
      if (isModuleKey(own)) {
        expect(MODULE_ENTITY_TYPES[own], `${type.entityType} in ${own}`).toContain(type.entityType);
      }
    }
  });

  it("find the module of an entity type", () => {
    expect(moduleForEntityType("sub_task")).toBe("tasks");
    expect(moduleForEntityType("nothing")).toBeUndefined();
  });
});
