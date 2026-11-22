import { act, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { STAGE, useStaged } from "./staged.ts";

function List({ items, layout = "" }: { items: number[]; layout?: string }) {
  return useStaged(items, layout).map((n) => <Text key={n}>{`Row ${n}`}</Text>);
}

// Opening a long list (a Space's Notes) built every row before the page could show, which
// held up the page change. The first screenful comes at once, the rest over the next frames.
describe("a long list", () => {
  const items = Array.from({ length: 150 }, (_, n) => n);

  it("shows its first screenful at once and the rest right after", () => {
    jest.useFakeTimers();
    render(<List items={items} />);
    expect(screen.getAllByText(/^Row/)).toHaveLength(STAGE.first);
    for (let frame = 0; frame < 10; frame++) act(() => jest.advanceTimersByTime(16));
    expect(screen.getAllByText(/^Row/)).toHaveLength(150);
    jest.useRealTimers();
  });

  it("shows a short list whole", () => {
    render(<List items={items.slice(0, 5)} />);
    expect(screen.getAllByText(/^Row/)).toHaveLength(5);
  });

  // Switching a list to cards (or discarding that) built every card in one go and froze the
  // page; the new layout is staged again from its first screenful.
  it("starts over when the layout changes, instead of building everything at once", () => {
    jest.useFakeTimers();
    const view = render(<List items={items} layout="list" />);
    for (let frame = 0; frame < 10; frame++) act(() => jest.advanceTimersByTime(16));
    expect(screen.getAllByText(/^Row/)).toHaveLength(150);
    view.rerender(<List items={items} layout="cards" />);
    expect(screen.getAllByText(/^Row/)).toHaveLength(STAGE.first);
    for (let frame = 0; frame < 10; frame++) act(() => jest.advanceTimersByTime(16));
    expect(screen.getAllByText(/^Row/)).toHaveLength(150);
    jest.useRealTimers();
  });
});
