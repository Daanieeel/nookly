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

// jsdom has no layout, so this pins the classes that keep a narrow card readable: below a
// container width the stack, name, counts and Study button sit on top of each other, so none
// of them is squeezed or covered, and they go side by side only when there is room.
describe("DecksPanel on a narrow card", () => {
  it("stacks the card's parts and puts the Study button in the flow, not over the name", async () => {
    renderWithProviders(<DecksPanel />);
    const open = await screen.findByRole("button", { name: "Open Test" });
    const study = screen.getByRole("button", { name: /^Study 1 cards of Test/ });
    const row = open.parentElement;
    expect(row).toHaveClass("flex-col", "@sm:flex-row");
    expect(row).toContainElement(study);
    expect(row?.parentElement).toHaveClass("@container");
    expect(open).not.toHaveClass("pr-24");
    expect(study.parentElement).not.toHaveClass("absolute");
    expect(study).toHaveClass("w-full", "@sm:w-auto");
  });

  it("shortens the counts to bare numbers instead of wrapping them", async () => {
    renderWithProviders(<DecksPanel />);
    await screen.findByRole("button", { name: "Open Test" });
    const counts = screen.getByText("learning").closest("div");
    expect(counts).toHaveClass("flex-nowrap");
    expect(counts).not.toHaveClass("flex-wrap");
    for (const label of ["new", "learning", "due"]) {
      expect(screen.getByText(label)).toHaveClass("@max-[13rem]:sr-only");
    }
    expect(counts?.parentElement).toHaveClass("@container");
  });
});
