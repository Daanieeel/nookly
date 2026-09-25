import { invoke } from "@tauri-apps/api/core";
import type { CardRating, DeckStats, DeckSummary, Entity, IndexCard } from "./types";

export function createDeck(spaceId: string, title: string, examId: string | null): Promise<Entity> {
  return invoke("create_deck", { spaceId, title, examId });
}

/// Every deck in the Space with its Exam and card counts, for the Decks page.
export function listDeckSummaries(spaceId: string): Promise<DeckSummary[]> {
  return invoke("list_deck_summaries", { spaceId });
}

/// Files the deck under an Exam, or under none with `null`.
export function setDeckExam(deckEntityId: string, examId: string | null): Promise<void> {
  return invoke("set_deck_exam", { deckEntityId, examId });
}

export function listDecks(spaceId: string): Promise<Entity[]> {
  return invoke("list_decks", { spaceId });
}

export function getDeckStats(deckEntityId: string): Promise<DeckStats> {
  return invoke("deck_stats", { deckEntityId });
}

export function createCard(deckEntityId: string, front: string, back: string): Promise<IndexCard> {
  return invoke("create_card", { deckEntityId, front, back });
}

export function updateCard(
  cardId: string,
  patch: { front?: string; back?: string },
): Promise<IndexCard> {
  return invoke("update_card", { cardId, ...patch });
}

export function deleteCard(cardId: string): Promise<void> {
  return invoke("delete_card", { cardId });
}

export function restoreCard(cardId: string): Promise<void> {
  return invoke("restore_card", { cardId });
}

export function listCards(deckEntityId: string): Promise<IndexCard[]> {
  return invoke("list_cards", { deckEntityId });
}

/// Cards to study now, in order: (re)learning, reviews, then new.
export function getStudyQueue(deckEntityId: string): Promise<IndexCard[]> {
  return invoke("study_queue", { deckEntityId });
}

export function reviewCard(cardId: string, rating: CardRating): Promise<IndexCard> {
  return invoke("review_card", { cardId, rating });
}

export function undoReview(cardId: string): Promise<IndexCard> {
  return invoke("undo_review", { cardId });
}
