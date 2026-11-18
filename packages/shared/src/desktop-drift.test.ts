import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { allDayChipLook, blockLook, itemAccent, todayLook } from "./calendar-style.ts";
import { HIGHLIGHT_BACKGROUNDS, HIGHLIGHT_TEXT_ON_LIGHT } from "./blocks/highlight-colors.ts";

/// The phone draws the calendar and highlights from this package; the desktop says the same
/// in Tailwind and CSS. These tests read the desktop's own files against the shared numbers,
/// so the two cannot drift apart.
const desktop = (path: string) =>
  readFileSync(new URL(`../../frontend/src/${path}`, import.meta.url), "utf8");
const percent = (alpha: number) => Math.round(alpha * 100);

describe("the calendar looks the same on the phone as on the desktop", () => {
  it("draws a session as an outline with a faint tint, in its Space's color or the primary", () => {
    const look = blockLook("session");
    const file = desktop("features/sessions/calendar/SessionBlock.tsx");
    expect(file).toContain(
      `border-${look.borderWidth} border-(--session-color) bg-(--session-color)/${percent(look.fillAlpha)}`,
    );
    expect(file).toContain('accentColor ?? "var(--primary)"');
    expect(itemAccent("session", undefined)).toEqual({ token: "primary" });
  });

  it("draws a calendar entry with a bar and a tint, in purple when its Space has no color", () => {
    const block = blockLook("calendar_entry");
    const chip = allDayChipLook("calendar_entry");
    const file = desktop("features/calendar-entries/calendar/CalendarEntryBlock.tsx");
    expect(file).toContain(
      `border-(--entry-color)/${percent(block.borderAlpha)} bg-(--entry-color)/${percent(block.fillAlpha)}`,
    );
    expect(file).toContain(`border-l-${block.leftBar}`);
    expect(file).toContain(`bg-(--entry-color)/${percent(chip.fillAlpha)}`);
    expect(file).toContain('accentColor ?? "var(--accent-purple)"');
    expect(itemAccent("calendar_entry", undefined)).toEqual({ token: "accent-purple" });
  });

  it("draws an exam with a bar and a tint, in the destructive color when its Space has none", () => {
    const block = blockLook("exam");
    const chip = allDayChipLook("exam");
    const file = desktop("features/exams/calendar/ExamCalendarItems.tsx");
    expect(file).toContain(
      `border-(--exam-color)/${percent(block.borderAlpha)} border-l-${block.leftBar} border-l-(--exam-color) bg-(--exam-color)/${percent(block.fillAlpha)}`,
    );
    expect(file).toContain(`bg-(--exam-color)/${percent(chip.fillAlpha)}`);
    expect(file).toContain('const EXAM_COLOR = "var(--destructive)"');
    expect(itemAccent("exam", undefined)).toEqual({ token: "destructive" });
  });

  it("tints today's column as strongly", () => {
    const file = desktop("features/sessions/calendar/today-style.ts");
    for (const color of ["primary", "neutral"] as const) {
      for (const intensity of ["low", "default", "high"] as const) {
        const look = todayLook(color, intensity);
        const tailwind = `${intensity}: "bg-${look.base}/${percent(look.columnAlpha)}"`;
        expect(file).toContain(tailwind);
      }
    }
  });
});

describe("highlight colors look the same on the phone as on the desktop", () => {
  it("are the same, in the light and the dark theme", () => {
    const css = desktop("styles.css");
    for (const look of Object.values(HIGHLIGHT_BACKGROUNDS)) {
      expect(css).toContain(`--mark-bg: ${look.light};`);
      expect(css).toContain(`--mark-bg: ${look.dark};`);
    }
    expect(css).toContain(`color: ${HIGHLIGHT_TEXT_ON_LIGHT};`);
  });
});
