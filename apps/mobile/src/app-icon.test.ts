import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const mobile = join(__dirname, "..");
const desktopIcon = join(mobile, "..", "desktop", "src-tauri", "icons", "Nookly.icon");

/// Every file of an Icon Composer folder, by its path inside it.
function files(dir: string, base = dir): Map<string, string> {
  const found = new Map<string, string>();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) for (const [k, v] of files(path, base)) found.set(k, v);
    else found.set(path.slice(base.length), readFileSync(path).toString("base64"));
  }
  return found;
}

describe("the app icon", () => {
  it("is the desktop's own Icon Composer icon, on the iPhone and iPad", () => {
    const config = JSON.parse(readFileSync(join(mobile, "app.json"), "utf8")) as {
      expo: { ios?: { icon?: string } };
    };
    const icon = config.expo.ios?.icon;
    expect(icon).toMatch(/\.icon$/);
    expect(files(join(mobile, icon ?? ""))).toEqual(files(desktopIcon));
  });
});
