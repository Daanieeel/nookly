import { describe, expect, it } from "vitest";
import { de } from "./de";
import { en } from "./en";

describe("hero beta note", () => {
  it("says Nookly is in beta, not a closed beta", () => {
    expect(en.hero.beta).toBe("In Beta");
    expect(de.hero.beta).toBe("In Beta");
  });
});
