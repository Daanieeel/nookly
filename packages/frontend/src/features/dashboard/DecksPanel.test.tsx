import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { makeEntity, makeSpace } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { mockCommand } from "#/test/tauri.ts";
import { DecksPanel } from "./DecksPanel.tsx";

beforeEach(() => {
  mockCommand("list_spaces", [makeSpace()]);
  mockCommand("list_exams_all_spaces", []);
  mockCommand("list_deck_summaries_all_spaces", [
    {
      entity: makeEntity({ id: "d1", type: "deck", title: "Test", key: "DCK-1" }),
      examId: null,
      stats: {
        total: 1,
        new: 1,
        learning: 0,
        due: 0,
        nextDueAt: null,
        reviewedToday: 0,
      },
    },
  ]);
});

// jsdom has no layout, so this pins the classes that keep a narrow card readable: the counts
// stay on one line and drop their words (kept for screen readers) when the text column is
// narrow, and the card keeps room for the Study button.
describe("DecksPanel on a narrow card", () => {
  it("shortens the counts to bare numbers instead of wrapping them", async () => {
    renderWithProviders(<DecksPanel />);
    const card = await screen.findByRole("button", { name: "Open Test" });
    expect(card).toHaveClass("pr-24");
    const counts = screen.getByText("learning").closest("div");
    expect(counts).toHaveClass("flex-nowrap");
    expect(counts).not.toHaveClass("flex-wrap");
    for (const label of ["new", "learning", "due"]) {
      expect(screen.getByText(label)).toHaveClass("@max-[13rem]:sr-only");
    }
    expect(counts?.parentElement).toHaveClass("@container");
  });
});
