import type { QueryClient } from "@tanstack/react-query";

export const deckKeys = {
  cards: (deckId: string) => ["cards", deckId] as const,
  queue: (deckId: string) => ["study-queue", deckId] as const,
  stats: (deckId: string) => ["deck-stats", deckId] as const,
  summaries: (spaceId: string) => ["deck-summaries", spaceId] as const,
};

export function invalidateDeck(queryClient: QueryClient, deckId: string) {
  return Promise.all([
    ...[deckKeys.cards, deckKeys.queue, deckKeys.stats].map((key) =>
      queryClient.invalidateQueries({ queryKey: key(deckId) }),
    ),
    // The Decks page and sidebar count every deck of a Space.
    queryClient.invalidateQueries({ queryKey: ["deck-summaries"] }),
  ]);
}

/// Cards ready to study now: new, learning and due reviews.
export function studyCount(stats: { new: number; learning: number; due: number }): number {
  return stats.new + stats.learning + stats.due;
}

/// A gap as Anki writes it on the rating buttons: 1m, 10m, 3h, 4d, 2.5mo, 1.2y.
export function formatInterval(dueIso: string, now = Date.now()): string {
  const minutes = Math.max(0, (new Date(dueIso).getTime() - now) / 60_000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)}d`;
  const trim = (n: number) => n.toFixed(1).replace(/\.0$/, "");
  if (days < 365) return `${trim(days / 30)}mo`;
  return `${trim(days / 365)}y`;
}

export function isDue(dueIso: string, now = Date.now()): boolean {
  return new Date(dueIso).getTime() <= now;
}

/// Typing into a field keeps its keys; page shortcuts only fire outside one.
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

/// Decks asked to open straight into a study session, e.g. from the Decks page.
const studyRequests = new Set<string>();

export function requestStudy(deckId: string) {
  studyRequests.add(deckId);
}

/// True once for a deck someone asked to study; the request is used up.
export function takeStudyRequest(deckId: string): boolean {
  return studyRequests.delete(deckId);
}
