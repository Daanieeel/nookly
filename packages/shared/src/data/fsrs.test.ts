import { describe, expect, it } from "vitest";
import { z } from "zod";
import fixtures from "../generated/fsrs-fixtures.json" with { type: "json" };
import { RATINGS, type Schedule, preview, review } from "./fsrs.ts";

const state = z.enum(["new", "learning", "review", "relearning"]);
const schedule = z.object({
  state,
  dueAt: z.string(),
  stability: z.number(),
  difficulty: z.number(),
  elapsedDays: z.number(),
  scheduledDays: z.number(),
  reps: z.number(),
  lapses: z.number(),
  lastReviewAt: z.string().nullable(),
});
const runs = z
  .array(
    z.array(
      z.object({
        now: z.string(),
        rating: z.enum(RATINGS),
        before: schedule,
        after: schedule,
        log: z.object({ state, elapsedDays: z.number(), scheduledDays: z.number() }),
      }),
    ),
  )
  .parse(fixtures);

function close(actual: Schedule, expected: Schedule) {
  expect({ ...actual, stability: 0, difficulty: 0 }).toEqual({
    ...expected,
    stability: 0,
    difficulty: 0,
  });
  expect(actual.stability).toBeCloseTo(expected.stability, 9);
  expect(actual.difficulty).toBeCloseTo(expected.difficulty, 9);
}

describe("FSRS, as the desktop schedules", () => {
  it.each(runs.map((steps, i) => [i, steps] as const))("replays run %i", (_, steps) => {
    for (const step of steps) {
      const result = review(step.before, step.rating, new Date(step.now));
      close(result.card, step.after);
      expect(result.log).toEqual({ rating: step.rating, ...step.log });
    }
  });

  it("previews each rating's next review", () => {
    const step = runs[0][2];
    const next = preview(step.before, new Date(step.now));
    expect(next.good).toBe(step.after.dueAt);
    expect(Date.parse(next.again)).toBeLessThan(Date.parse(next.easy));
  });
});
