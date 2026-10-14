import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ASSIGNMENT_STATUSES, EXAM_STATUSES, labelColorFor } from "./colors.ts";
import { entityType } from "./schema.ts";

const enumKind = z.object({ type: z.literal("enum"), values: z.array(z.string()) });

function enumOf(type: string, field: string): string[] {
  const kind = entityType(type)?.fields.find((f) => f.name === field)?.kind;
  return enumKind.parse(kind).values;
}

describe("fixed statuses", () => {
  it("are the ones the desktop accepts, in its order", () => {
    expect(EXAM_STATUSES.map((s) => s.id)).toEqual(enumOf("exam", "status"));
    expect(ASSIGNMENT_STATUSES.map((s) => s.id)).toEqual(enumOf("assignment", "status"));
  });
});

describe("label colors", () => {
  it("are the same for the same name", () => {
    expect(labelColorFor("Urgent")).toBe(labelColorFor("Urgent"));
  });
});
