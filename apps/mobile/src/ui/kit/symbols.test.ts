import { MODULE_KEYS } from "@nookly/shared/modules";
import { MODULE_ICONS } from "../icons.tsx";
import { isTintName } from "../tokens.ts";
import { MODULE_BADGES } from "./symbols.ts";

describe("module symbols (D51)", () => {
  it("give every module an SF Symbol, its Tabler twin and a tint", () => {
    for (const key of MODULE_KEYS) {
      const badge = MODULE_BADGES[key];
      expect(badge.symbol.length).toBeGreaterThan(0);
      expect(badge.fallback).toBe(MODULE_ICONS[key]);
      expect(isTintName(badge.tint)).toBe(true);
    }
  });
});
