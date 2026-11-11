import { describe, expect, it } from "vitest";
import { actionsFor } from "#/components/context-menu/registry.ts";
import "#/components/context-menu/entity-actions.tsx";
import "./context-actions.tsx";

describe("the copy mention actions", () => {
  it("names the block action after what it copies", () => {
    const action = actionsFor("note.block").find((a) => a.id === "copy-block-link");
    expect(action?.label).toBe("Copy Mention for Block");
    expect(action?.successLabel).toBe("Mention copied");
  });

  it("names the entity action after what it copies", () => {
    const action = actionsFor("entity").find((a) => a.id === "copy-link");
    expect(action?.label).toBe("Copy Mention");
    expect(action?.successLabel).toBe("Mention copied");
  });
});
