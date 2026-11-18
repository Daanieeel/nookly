import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/// Every source file under `dir`, tests left out.
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

const root = join(__dirname, "..");
const pressed = (classes: string) => classes.includes("active:");

/// Class lists that have a pressed style (`active:`) in one state and none in the other.
function switching(text: string): string[] {
  const found: string[] = [];
  for (const [whole, a, b] of text.matchAll(/\?\s*"([^"]*)"\s*:\s*"([^"]*)"/g)) {
    if (pressed(a) !== pressed(b)) found.push(whole);
  }
  for (const match of text.matchAll(/&&\s*"([^"]*active:[^"]*)"/g)) {
    // Fine when the list always has a pressed style of its own.
    const call = text.lastIndexOf("cn(", match.index);
    const base = /"([^"]*)"/.exec(text.slice(call, match.index))?.[1] ?? "";
    if (!pressed(base)) found.push(match[0]);
  }
  return found;
}

// Nativewind's styles remount everything inside a pressable whose class list gains or loses
// a pressed style (`active:`) after it first drew: a tab, a sidebar row or a palette row did
// on every selection, rebuilding its contents on a tap.
describe("a pressable's classes", () => {
  it("keep a pressed style in every state, or none in any", () => {
    const bad = sources(root).flatMap((file) =>
      switching(readFileSync(file, "utf8")).map((what) => `${relative(root, file)}: ${what}`),
    );
    expect(bad).toEqual([]);
  });
});
