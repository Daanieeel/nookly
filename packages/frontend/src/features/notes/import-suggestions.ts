import type { Entity } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";

const MAX_SUGGESTIONS = 3;
/// A word shorter than this says too little to link two items ("the", "and").
const MIN_WORD = 4;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function words(text: string): Set<string> {
  return new Set(
    normalize(text)
      .split(" ")
      .filter((w) => w.length >= MIN_WORD),
  );
}

function score(title: string, candidate: string): number {
  const a = normalize(title);
  const b = normalize(candidate);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (Math.min(a.length, b.length) >= MIN_WORD && (a.includes(b) || b.includes(a))) return 50;
  const shared = [...words(title)].filter((w) => words(candidate).has(w)).length;
  return shared * 10;
}

/// The existing items whose title is closest to an imported title, best first. Only a
/// suggestion for the user to accept: nothing is linked from here.
export function suggestRelations(title: string, entities: Entity[], chosenIds: string[]): Entity[] {
  return entities
    .filter((e) => !e.deletedAt && !chosenIds.includes(e.id))
    .map((entity) => ({ entity, score: score(title, displayTitle(entity)) }))
    .filter((m) => m.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, MAX_SUGGESTIONS)
    .map((m) => m.entity);
}

/// An item of the same type and title, the one an import would sit next to twice.
export function findDuplicate(kind: string, title: string, entities: Entity[]): Entity | undefined {
  const wanted = normalize(title);
  return entities.find((e) => !e.deletedAt && e.type === kind && normalize(e.title) === wanted);
}
