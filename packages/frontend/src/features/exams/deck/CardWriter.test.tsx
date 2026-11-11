import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, installTauriMock, mockCommand, uninstallTauriMock } from "#/test/tauri.ts";
import type { IndexCard } from "#/lib/api/types.ts";
import { CardWriter } from "./CardWriter.tsx";

function card(over: Partial<IndexCard> = {}): IndexCard {
  return {
    id: "c1",
    deckEntityId: "d1",
    front: "Capital of France",
    back: "Paris",
    frontBlocks: null,
    backBlocks: null,
    state: "new",
    dueAt: "2026-01-01T00:00:00Z",
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    lastReviewAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    deletedAt: null,
    next: { again: "", hard: "", good: "", easy: "" },
    ...over,
  };
}

function editorOf(name: "Card front" | "Card back"): HTMLElement {
  const el = document.querySelector<HTMLElement>(`.ProseMirror[aria-label="${name}"]`);
  if (!el) throw new Error(`no editor named ${name}`);
  return el;
}

/// The side facing up has the caret once its editor has mounted.
async function caretIn(name: "Card front" | "Card back") {
  await waitFor(() => expect(document.activeElement).toBe(editorOf(name)));
}

beforeEach(() => {
  installTauriMock();
  mockCommand("list_entities", []);
  mockCommand("create_card", card());
  mockCommand("update_card", card());
});
afterEach(uninstallTauriMock);

describe("CardWriter", () => {
  it("writes each side in a block editor, Tab flips and Enter starts a new line", async () => {
    const { user } = renderWithProviders(
      <CardWriter deckId="d1" spaceId="s1" count={0} onDone={() => {}} />,
    );
    await caretIn("Card front");
    await user.keyboard("Name the organelle{Enter}with two membranes");
    // Enter did not flip the card or add it: it made a second line.
    expect(editorOf("Card front").querySelectorAll("p")).toHaveLength(2);
    expect(callsOf("create_card")).toHaveLength(0);

    await user.keyboard("{Tab}");
    await caretIn("Card back");
    await user.keyboard("Mitochondrion");

    await user.keyboard("{Meta>}{Enter}{/Meta}");
    await waitFor(() => expect(callsOf("create_card")).toHaveLength(1));
    expect(callsOf("create_card")[0]).toEqual({
      deckEntityId: "d1",
      frontBlocks: [
        { type: "paragraph", content: "Name the organelle" },
        { type: "paragraph", content: "with two membranes" },
      ],
      backBlocks: [{ type: "paragraph", content: "Mitochondrion" }],
    });
  });

  it("does not add a card with an empty side", async () => {
    const { user } = renderWithProviders(
      <CardWriter deckId="d2" spaceId="s1" count={0} onDone={() => {}} />,
    );
    await caretIn("Card front");
    await user.keyboard("Only a front");
    await user.keyboard("{Control>}{Enter}{/Control}");
    // The empty back is where the caret goes.
    await caretIn("Card back");
    expect(callsOf("create_card")).toHaveLength(0);
  });

  it("opens an old card's text as blocks and leaves it untouched when nothing changed", async () => {
    let done = 0;
    const { user } = renderWithProviders(
      <CardWriter
        deckId="d1"
        spaceId="s1"
        count={1}
        editing={card({ front: "Capital of **France**\nin Europe" })}
        onDone={() => done++}
      />,
    );
    expect(editorOf("Card front").querySelectorAll("p")).toHaveLength(2);
    expect(editorOf("Card front").querySelector("strong")?.textContent).toBe("France");
    await caretIn("Card front");
    await user.keyboard("{Escape}");
    expect(done).toBe(1);
    expect(callsOf("update_card")).toHaveLength(0);
  });

  it("saves an edited old card as blocks when leaving", async () => {
    let done = 0;
    const { user } = renderWithProviders(
      <CardWriter deckId="d1" spaceId="s1" count={1} editing={card()} onDone={() => done++} />,
    );
    await caretIn("Card front");
    await user.keyboard("?");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(callsOf("update_card")).toHaveLength(1));
    expect(callsOf("update_card")[0]).toEqual({
      cardId: "c1",
      frontBlocks: [{ type: "paragraph", content: "Capital of France?" }],
      backBlocks: [{ type: "paragraph", content: "Paris" }],
    });
    await waitFor(() => expect(done).toBe(1));
  });
});
