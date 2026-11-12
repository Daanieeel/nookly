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
  // The desktop has ghost icon buttons; iOS 26 draws a round glass background behind bar
  // items unless each one says not to.
  it("all go without the round background", () => {
    const root = join(__dirname, "..");
    for (const file of sources(root)) {
      const text = readFileSync(file, "utf8");
      const buttons = text.match(/<Stack\.Toolbar\.Button[\s\S]*?\/>/g) ?? [];
      for (const button of buttons)
        expect([file, button.includes("{...BAR_BUTTON}")]).toEqual([file, true]);
      expect([file, /headerLeft:|headerRight:/.test(text)]).toEqual([file, false]);
      // Every bar button is the system's own, with a Tabler icon; none is drawn by the app.
      expect([file, /type: "custom"|barItem\(/.test(text)]).toEqual([file, false]);
      if (text.includes("headerRightBarButtonItems")) {
        expect([file, text.includes("hidesSharedBackground: true")]).toEqual([file, true]);
      }
    }
  });
});
