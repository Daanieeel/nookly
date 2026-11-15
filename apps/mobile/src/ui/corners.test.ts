import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/// Every source file under `dir`, tests left out.
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const root = join(__dirname, "..");

/// Where the phone may still round fully, each for what the desktop draws round too: status
/// and colour dots, colour swatches, the sheet's grabber, thin bars, today's date in the week;
/// and the glass button that sits beside the system's round bar buttons.
const ROUND_ON_DESKTOP: [file: string, line: string][] = [
  ["ui/Badge.tsx", "size-2 rounded-full"],
  ["screens/MergeEditor.tsx", "size-2 rounded-full"],
  ["screens/StudyGalleries.tsx", "size-2 rounded-full"],
  ["screens/CalendarScreen.tsx", "size-1.5 rounded-full"],
  ["ui/kit/ColorChoices.tsx", "borderRadius: DOT / 2"],
  ["ui/sheet/Sheet.tsx", "h-1 w-9 rounded-full"],
  ["screens/CalendarScreen.tsx", "w-1 self-stretch rounded-full"],
  ["screens/GradesScreen.tsx", "h-2 flex-row gap-0.5 overflow-hidden rounded-full"],
  ["screens/TimeGrid.tsx", "h-6 min-w-6 items-center justify-center rounded-full"],
  // Beside the system's own round bar buttons, which the app can't reshape.
  ["ui/GlassButton.tsx", "borderRadius: MIN_TOUCH / 2"],
];

/// Ways a component rounds itself into a pill or a circle.
const FULL = [/RADIUS\.pill/, /rounded-full/, /borderRadius:\s*[A-Z_a-z.]+\s*\/\s*2\b/];

// Buttons, chips, fields and bars are squircles with the desktop's regular corners, not pills.
describe("the phone's corners", () => {
  it("round controls like the desktop, never into a pill", () => {
    const pills = sources(root).flatMap((file) => {
      const path = relative(root, file);
      return readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, i) =>
          FULL.some((re) => re.test(line)) &&
          !ROUND_ON_DESKTOP.some(([f, l]) => f === path && line.includes(l))
            ? [`${path}:${i + 1}`]
            : [],
        );
    });
    expect(pills).toEqual([]);
  });
});
