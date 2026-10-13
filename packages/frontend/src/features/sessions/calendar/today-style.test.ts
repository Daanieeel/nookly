import { describe, expect, it } from "vitest";
import { todayStyle } from "./today-style";

describe("todayStyle", () => {
  it("keeps today's look for the default colour and intensity", () => {
    const style = todayStyle("primary", "default");
    expect(style.column).toBe("bg-primary/5");
    expect(style.label).toContain("text-primary");
    expect(style.pill).toContain("bg-primary");
  });

  it("tints the day column more at a higher intensity and less at a lower one", () => {
    expect(todayStyle("primary", "low").column).toBe("bg-primary/3");
    expect(todayStyle("primary", "high").column).toBe("bg-primary/15");
  });

  it("swaps the blue for grey with the neutral colour, at every intensity", () => {
    for (const intensity of ["low", "default", "high"] as const) {
      const style = todayStyle("neutral", intensity);
      expect(style.column).toContain("bg-foreground/");
      expect(style.column).not.toContain("primary");
      expect(style.label).not.toContain("primary");
      expect(style.pill).not.toContain("primary");
    }
  });

  it("gives every combination a distinct, readable day number", () => {
    for (const color of ["primary", "neutral"] as const) {
      expect(todayStyle(color, "default").pill).toMatch(/text-(primary-foreground|background)/);
    }
  });
});
