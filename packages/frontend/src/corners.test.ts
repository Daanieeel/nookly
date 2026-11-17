import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/// Every source file under `dir`, tests left out.
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const root = __dirname;

/// What may stay round, as on the phone: dots, thin bars and lines (and what fills them),
/// blurred glows that show no edge, and these.
const TINY = /\b(size-(1|1\.5|2|2\.5|3)|h-(0\.5|1|1\.5)|w-(0\.5|1))\b|blur-3xl/;
const ROUND: [file: string, line: string][] = [
  // Colour swatches.
  ["classes.ts", "COLOR_SWATCH_CLASSES"],
  ["features/notes/HighlightColorBar.tsx", "bg-(--swatch)"],
  ["features/notes/TextColorBar.tsx", "bg-(--swatch)"],
  ["components/icon-picker.tsx", "size-5 rounded-full border border-border bg-muted-foreground/40"],
  ["components/icon-picker.tsx", "bg-(--swatch-color)"],
  // Today's date in a calendar, and the timeline's "now" and its points.
  ["features/settings/CalendarPreview.tsx", "flex size-5 items-center justify-center rounded-full"],
  ["features/sessions/calendar/TimeGrid.tsx", "flex size-6 shrink-0 items-center"],
  ["features/sessions/calendar/MonthGrid.tsx", "flex size-6 shrink-0 items-center"],
  ["features/exams/ExamsListView.tsx", "relative size-4 rounded-full bg-primary"],
  ["features/exams/ExamsListView.tsx", "animate-pulse rounded-full bg-primary/25"],
  ["features/notes/TimelineBlock.tsx", "relative flex size-4 shrink-0"],
  // The fill inside a thin bar.
  ["features/tasks/TaskDetailView.tsx", "size-full origin-left rounded-full"],
  ["features/grades/GradeReportView.tsx", "grow-(--share) basis-0 rounded-full"],
  ["features/notes/ProgressBlock.tsx", "h-full w-(--fill) rounded-full"],
  ["features/sync/FirstSyncDialog.tsx", "h-full w-(--progress) rounded-full"],
];

// Chips, badges, buttons and avatars are squircles with the regular corners, never pills.
describe("the desktop's corners", () => {
  it("round controls with the regular radius, never into a pill", () => {
    const pills = sources(root).flatMap((file) => {
      const path = relative(root, file);
      return readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, i) =>
          line.includes("rounded-full") &&
          !TINY.test(line) &&
          !ROUND.some(([f, l]) => f === path && line.includes(l))
            ? [`${path}:${i + 1}`]
            : [],
        );
    });
    expect(pills).toEqual([]);
  });

  // 10px corners on a 20px button draw a circle too.
  it("keep the smallest buttons' corners under half their size", () => {
    const circles = sources(root).flatMap((file) => {
      const path = relative(root, file);
      return readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, i) =>
          /(^|[\s"'`])size-(4|5)\b/.test(line) && /\brounded-(md|lg|xl)\b/.test(line)
            ? [`${path}:${i + 1}`]
            : [],
        );
    });
    expect(circles).toEqual([]);
  });
});

// The squircle (`corner-shape` in `styles.css`) on an element that clips what is inside it
// made WebKit keep the clip from the element's first, narrower size: the Tasks, Calendar and
// Assignments pages were cut off partway across the window. Clipping elements keep plain
// rounding.
describe("the squircle corners", () => {
  const css = readFileSync(join(root, "styles.css"), "utf8");
  const selector =
    /@supports \(corner-shape: superellipse\([\d.]+\)\) \{\s*([^{]+)\{/.exec(css)?.[1]?.trim() ??
    "";
  const squircled = (className: string) => {
    const el = document.createElement("div");
    el.className = className;
    return el.matches(selector);
  };

  it("round cards, buttons and chips", () => {
    expect(squircled("rounded-lg border")).toBe(true);
    expect(squircled("rounded-md px-2")).toBe(true);
  });

  it("leave pills, circles and whatever clips its content plainly rounded", () => {
    expect(squircled("size-2 rounded-full")).toBe(false);
    for (const clip of [
      "overflow-hidden",
      "overflow-auto",
      "overflow-clip",
      "overflow-x-auto",
      "overflow-y-auto",
      "overflow-x-hidden",
      "overflow-y-scroll",
    ]) {
      expect(squircled(`relative flex rounded-xl ${clip} border`)).toBe(false);
    }
  });
});
