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
// wrap instead of running under the Study button, and the card keeps room for the button.
describe("DecksPanel on a narrow card", () => {
  it("lets the counts wrap and leaves room for the Study button", async () => {
    renderWithProviders(<DecksPanel />);
    const card = await screen.findByRole("button", { name: "Open Test" });
    expect(card).toHaveClass("pr-24");
    expect(screen.getByText("learning").closest("div")).toHaveClass("flex-wrap");
  });
});
