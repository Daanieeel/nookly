import { MODULE_KEYS } from "@nookly/shared/modules";
import { MODULE_ICONS } from "../icons.tsx";
import { isTintName } from "../tokens.ts";
import { MODULE_BADGES } from "./badges.ts";

describe("module badges", () => {
  it("draw every module with the desktop's icon for it and a tint", () => {
    for (const key of MODULE_KEYS) {
      const badge = MODULE_BADGES[key];
      expect(badge.glyph).toBe(MODULE_ICONS[key]);
      expect(isTintName(badge.tint)).toBe(true);
    }
  });
});
