import { screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { GroupedBoard } from "./grouped-board.tsx";
import type { ViewGroup } from "./grouping.ts";

interface Card {
  id: string;
  title: string;
}

const group = (id: string, name: string, items: Card[]): ViewGroup<Card> => ({
  id,
  name,
  items,
  subgroups: null,
});

const GROUPS = [
  group("todo", "Todo", [{ id: "a", title: "Write essay" }]),
  group("done", "Done", [{ id: "b", title: "Read chapter" }]),
  group("cancelled", "Cancelled", []),
];

function Board({ initial = [] }: { initial?: string[] }) {
  const [hidden, setHidden] = useState(initial);
  return (
    <GroupedBoard
      groups={GROUPS}
      getKey={(card) => card.id}
      draggable={false}
      renderCard={(card) => <p>{card.title}</p>}
      renderOverlay={(card) => <p>{card.title}</p>}
      hiddenColumns={hidden}
      onHiddenColumnsChange={setHidden}
    />
  );
}

describe("GroupedBoard hiding columns", () => {
  it("hides a column from its header and brings it back from the chip", async () => {
    const { user } = renderWithProviders(<Board />);
    expect(screen.getByRole("region", { name: "Done" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Hide Done" }));
    expect(screen.queryByRole("region", { name: "Done" })).toBeNull();
    expect(screen.queryByText("Read chapter")).toBeNull();
    expect(screen.getByRole("region", { name: "Todo" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "1 hidden column" }));
    const list = await screen.findByRole("dialog");
    expect(within(list).getByText("Done")).toBeTruthy();
    await user.click(within(list).getByRole("button", { name: "Show Done" }));
    expect(await screen.findByRole("region", { name: "Done" })).toBeTruthy();
    expect(screen.getByText("Read chapter")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /hidden column/ })).toBeNull();
  });

  it("opens with the columns that were hidden before", () => {
    renderWithProviders(<Board initial={["done", "cancelled"]} />);
    expect(screen.queryByRole("region", { name: "Done" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Cancelled" })).toBeNull();
    expect(screen.getByRole("button", { name: "2 hidden columns" })).toBeTruthy();
  });

  it("shows every column and no chip when the board cannot hide columns", () => {
    renderWithProviders(
      <GroupedBoard
        groups={GROUPS}
        getKey={(card) => card.id}
        draggable={false}
        renderCard={(card) => <p>{card.title}</p>}
        renderOverlay={(card) => <p>{card.title}</p>}
      />,
    );
    expect(screen.getAllByRole("region")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /Hide/ })).toBeNull();
  });

  it("has no axe violations with the hidden columns list open", async () => {
    const { user } = renderWithProviders(<Board initial={["done"]} />);
    await user.click(screen.getByRole("button", { name: "1 hidden column" }));
    await screen.findByRole("dialog");
    await expectNoA11yViolations();
  });
});
