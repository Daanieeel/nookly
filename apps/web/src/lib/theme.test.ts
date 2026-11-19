import { afterEach, describe, expect, it } from "vitest";
import { readTheme, THEME_KEY } from "./theme";

describe("readTheme", () => {
  afterEach(() => localStorage.clear());

  it("follows the system for a visitor who never picked a theme", () => {
    expect(readTheme()).toBe("system");
  });

  it("keeps the theme a visitor picked", () => {
    localStorage.setItem(THEME_KEY, "light");
    expect(readTheme()).toBe("light");
    localStorage.setItem(THEME_KEY, "dark");
    expect(readTheme()).toBe("dark");
  });
});
