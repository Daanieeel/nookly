import { describe, expect, it } from "vitest";
import { USERNAME_PATTERN, suggestUsername } from "./username.ts";

describe("suggesting a username", () => {
  it("makes the name the other account gave fit", () => {
    expect(suggestUsername("Grace Hopper")).toBe("grace_hopper");
    expect(suggestUsername("  Ada   Lovelace ")).toBe("ada_lovelace");
    expect(suggestUsername("Zoë Müller")).toBe("zoe_muller");
    expect(suggestUsername("octo.cat-99")).toBe("octo.cat99");
  });

  it("keeps it within the limit, and always something the server takes", () => {
    const long = suggestUsername("x".repeat(80));
    expect(long).toHaveLength(30);
    for (const name of ["Grace Hopper", "Zoë", "x".repeat(80), "octo.cat"]) {
      const suggestion = suggestUsername(name);
      if (suggestion) expect(USERNAME_PATTERN.test(suggestion)).toBe(true);
    }
  });

  it("suggests nothing when nothing usable is left", () => {
    expect(suggestUsername("")).toBe("");
    expect(suggestUsername("李雷")).toBe("");
    expect(suggestUsername("ab")).toBe("");
  });
});
