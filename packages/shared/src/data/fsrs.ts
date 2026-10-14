/// FSRS spaced repetition, as the desktop schedules cards with `rs-fsrs` 1.2.1 at its
/// defaults (short term steps on, no fuzz). A card reviewed on the phone comes back
/// on the same day it would after a review on the desktop; `fsrs.test.ts` checks this
/// against reviews the desktop scheduled (`generated/fsrs-fixtures.json`).

export type CardState = "new" | "learning" | "review" | "relearning";
export type Rating = "again" | "hard" | "good" | "easy";

export const RATINGS: Rating[] = ["again", "hard", "good", "easy"];

/// The scheduling columns of an index card.
export interface Schedule {
  state: CardState;
  dueAt: string;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  lastReviewAt: string | null;
}

export interface Review {
  card: Schedule;
  /// What the review log keeps: the state and days before this review.
  log: { rating: Rating; state: CardState; elapsedDays: number; scheduledDays: number };
}

const W = [
  0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0234, 1.616, 0.1544, 1.0824, 1.9813,
  0.0953, 0.2975, 2.2042, 0.2407, 2.9466, 0.5034, 0.6567,
];
const REQUEST_RETENTION = 0.9;
const MAXIMUM_INTERVAL = 36500;
const DECAY = -0.5;
const FACTOR = 19 / 81;
const MINUTE = 60_000;
const DAY = 86_400_000;

const grade = (rating: Rating) => RATINGS.indexOf(rating) + 1;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
/// Whole days between two times, cut toward zero like chrono's `num_days`.
const daysBetween = (from: number, to: number) => Math.trunc((to - from) / DAY);

function forgettingCurve(elapsedDays: number, stability: number): number {
  return (1 + (FACTOR * elapsedDays) / stability) ** DECAY;
}

function initDifficulty(rating: Rating): number {
  return clamp(W[4] - Math.exp(W[5] * (grade(rating) - 1)) + 1, 1, 10);
}

function initStability(rating: Rating): number {
  return Math.max(W[grade(rating) - 1], 0.1);
}

function nextInterval(stability: number): number {
  return clamp(
    Math.round((stability / FACTOR) * (REQUEST_RETENTION ** (1 / DECAY) - 1)),
    1,
    MAXIMUM_INTERVAL,
  );
}

function nextDifficulty(difficulty: number, rating: Rating): number {
  const next = W[6] * -(grade(rating) - 3) + difficulty;
  return clamp(W[7] * initDifficulty("easy") + (1 - W[7]) * next, 1, 10);
}

function shortTermStability(stability: number, rating: Rating): number {
  return stability * Math.exp(W[17] * (grade(rating) - 3 + W[18]));
}

function nextRecallStability(d: number, s: number, r: number, rating: Rating): number {
  const modifier = rating === "hard" ? W[15] : rating === "easy" ? W[16] : 1;
  return s * (Math.exp(W[8]) * (11 - d) * s ** -W[9] * Math.expm1((1 - r) * W[10]) * modifier + 1);
}

function nextForgetStability(d: number, s: number, r: number): number {
  return W[11] * d ** -W[12] * ((s + 1) ** W[13] - 1) * Math.exp((1 - r) * W[14]);
}

/// The stored time format of the desktop (`to_rfc3339` of a UTC time).
/// Like chrono, it leaves out a fraction of zero.
const stamp = (time: number) =>
  new Date(time).toISOString().replace(".000Z", "Z").replace("Z", "+00:00");

/// The card after `rating` at `now`, and its review log entry.
export function review(card: Schedule, rating: Rating, now: Date): Review {
  const at = now.getTime();
  const lastReview = card.lastReviewAt ? Date.parse(card.lastReviewAt) : at;
  const elapsedDays = card.state === "new" ? 0 : daysBetween(lastReview, at);
  const log = { rating, state: card.state, elapsedDays, scheduledDays: card.scheduledDays };
  const base = { ...card, elapsedDays, reps: card.reps + 1, lastReviewAt: stamp(at) };
  const inMinutes = (minutes: number) => stamp(at + minutes * MINUTE);
  const inDays = (days: number) => stamp(at + days * DAY);

  if (card.state === "new") {
    const next = { ...base, difficulty: initDifficulty(rating), stability: initStability(rating) };
    if (rating === "easy") {
      const days = nextInterval(next.stability);
      return { card: { ...next, scheduledDays: days, dueAt: inDays(days), state: "review" }, log };
    }
    const minutes = rating === "again" ? 1 : rating === "hard" ? 5 : 10;
    return {
      card: { ...next, scheduledDays: 0, dueAt: inMinutes(minutes), state: "learning" },
      log,
    };
  }

  if (card.state === "learning" || card.state === "relearning") {
    const next = {
      ...base,
      difficulty: nextDifficulty(card.difficulty, rating),
      stability: shortTermStability(card.stability, rating),
    };
    if (rating === "again" || rating === "hard") {
      const minutes = rating === "again" ? 5 : 10;
      return { card: { ...next, scheduledDays: 0, dueAt: inMinutes(minutes) }, log };
    }
    let days = nextInterval(next.stability);
    if (rating === "easy") {
      const good = nextInterval(shortTermStability(card.stability, "good"));
      days = Math.max(days, good + 1);
    }
    return { card: { ...next, scheduledDays: days, dueAt: inDays(days), state: "review" }, log };
  }

  const r = forgettingCurve(daysBetween(lastReview, at), card.stability);
  const { difficulty: d, stability: s } = card;
  const difficulty = nextDifficulty(d, rating);
  if (rating === "again") {
    return {
      card: {
        ...base,
        difficulty,
        stability: nextForgetStability(d, s, r),
        scheduledDays: 0,
        dueAt: inMinutes(5),
        state: "relearning",
        lapses: card.lapses + 1,
      },
      log,
    };
  }
  const stabilities = {
    hard: nextRecallStability(d, s, r, "hard"),
    good: nextRecallStability(d, s, r, "good"),
    easy: nextRecallStability(d, s, r, "easy"),
  };
  let good = nextInterval(stabilities.good);
  const hard = Math.min(nextInterval(stabilities.hard), good);
  good = Math.max(good, hard + 1);
  const easy = Math.max(nextInterval(stabilities.easy), good + 1);
  const days = { hard, good, easy }[rating];
  return {
    card: {
      ...base,
      difficulty,
      stability: stabilities[rating],
      scheduledDays: days,
      dueAt: inDays(days),
      state: "review",
    },
    log,
  };
}

/// When the card comes back for each rating, like the desktop's `next` preview.
export interface NextDue {
  again: string;
  hard: string;
  good: string;
  easy: string;
}

export function preview(card: Schedule, now: Date): NextDue {
  return {
    again: review(card, "again", now).card.dueAt,
    hard: review(card, "hard", now).card.dueAt,
    good: review(card, "good", now).card.dueAt,
    easy: review(card, "easy", now).card.dueAt,
  };
}
