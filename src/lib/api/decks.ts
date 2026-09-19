import { invoke } from "@tauri-apps/api/core";
import type { Entity, IndexCard } from "./types";

export function createDeck(spaceId: string, title: string, examId: string): Promise<Entity> {
  return invoke("create_deck", { spaceId, title, examId });
}

export function listDecks(spaceId: string): Promise<Entity[]> {
  return invoke("list_decks", { spaceId });
}

export function createCard(deckEntityId: string, front: string, back: string): Promise<IndexCard> {
  return invoke("create_card", { deckEntityId, front, back });
}

export function listCards(deckEntityId: string): Promise<IndexCard[]> {
  return invoke("list_cards", { deckEntityId });
}

export function listDueCards(deckEntityId: string): Promise<IndexCard[]> {
  return invoke("list_due_cards", { deckEntityId });
}

export function reviewCard(cardId: string, remembered: boolean): Promise<IndexCard> {
  return invoke("review_card", { cardId, remembered });
}
