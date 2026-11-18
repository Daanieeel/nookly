import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/// Every source file of the app, tests aside.
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "test" ? [] : sources(path);
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

describe("the bar's buttons", () => {
  // iOS 26 draws the round glass background behind bar items, the back button included;
  // every corner button keeps it so they all look alike.
  it("all keep the system's round background, like the back button", () => {
    const root = join(__dirname, "..");
    for (const file of sources(root)) {
      const text = readFileSync(file, "utf8");
      const buttons = text.match(/<Stack\.Toolbar\.Button[\s\S]*?\/>/g) ?? [];
      for (const button of buttons)
        expect([file, button.includes("{...BAR_BUTTON}")]).toEqual([file, true]);
      expect([file, /headerLeft:|headerRight:/.test(text)]).toEqual([file, false]);
      // Every bar button is the system's own, with a Tabler icon; none is drawn by the app.
      expect([file, /type: "custom"|barItem\(/.test(text)]).toEqual([file, false]);
      expect([file, /hidesSharedBackground: true/.test(text)]).toEqual([file, false]);
    }
  });
});
