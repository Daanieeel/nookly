import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/// Every source file under `dir`, tests left out.
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/// The Tabler icons a set of files imports.
function tablerIcons(files: string[]): Set<string> {
  const names = new Set<string>();
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const block of text.matchAll(
      /import\s*\{([^}]*)\}\s*from\s*"@tabler\/icons-react(?:-native)?"/g,
    )) {
      for (const name of block[1].matchAll(/\bIcon[A-Z]\w*/g)) names.add(name[0]);
    }
  }
  return names;
}

const phone = sources(join(__dirname, "..", ".."));
const desktop = sources(join(__dirname, "..", "..", "..", "..", "..", "packages"));

/// The phone draws the desktop's icons and no others: the same Tabler set, never a system
/// symbol in their place.
describe("the phone's icons", () => {
  it("are all icons the desktop uses", () => {
    const theirs = tablerIcons(desktop);
    const extra = [...tablerIcons(phone)].filter((name) => !theirs.has(name)).sort();
    expect(extra).toEqual([]);
  });

  it("on the system's bar buttons are drawn from desktop icons too", () => {
    const theirs = tablerIcons(desktop);
    const drawn = readdirSync(join(__dirname, "..", "..", "..", "assets", "toolbar"))
      .map((file) => file.replace(/(@\dx)?\.png$/, ""))
      .map((name) => `Icon${name.replace(/(^|-)(\w)/g, (_, _dash, c: string) => c.toUpperCase())}`);
    expect([...new Set(drawn)].filter((name) => !theirs.has(name))).toEqual([]);
  });

  it("never come from SF Symbols", () => {
    const symbols = phone.filter((file) => readFileSync(file, "utf8").includes("expo-symbols"));
    expect(symbols).toEqual([]);
  });
});
