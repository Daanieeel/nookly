import { describe, expect, it } from "vitest";
import { makeEntity } from "#/test/fixtures.ts";
import { matchesQuery } from "./list-table-shared.tsx";

describe("matchesQuery with accents", () => {
  // SAFETY: only the entity's key is read from the summary.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- a stub of a page summary
  const summary = { entity: makeEntity({ key: "FIL-459" }) } as unknown as Parameters<
    typeof matchesQuery
  >[0]["summary"];
  const row = { title: "U\u0308bungsblatt", preview: "Analysis", summary };

  it("finds a decomposed title by what the keyboard types", () => {
    expect(matchesQuery(row, "\u00fcbungsblatt", "\u00dcbungsblatt")).toBe(true);
    expect(matchesQuery(row, "ubung", "ubung")).toBe(true);
  });
});
