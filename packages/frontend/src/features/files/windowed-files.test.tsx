import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useListLayout } from "#/test/layout.ts";
import { SCROLL_ROOT_ATTRIBUTE, WINDOW_FROM } from "#/hooks/use-windowed-list.ts";
import { WindowedFiles } from "./windowed-files.tsx";

useListLayout({ viewport: 600, row: 100 });

const names = (count: number) => Array.from({ length: count }, (_, i) => `File ${i}`);

function Files({ count, layout }: { count: number; layout: "grid" | "list" }) {
  return (
    <div {...{ [SCROLL_ROOT_ATTRIBUTE]: "" }}>
      <WindowedFiles
        items={names(count)}
        layout={layout}
        renderItem={(name) => <li key={name}>{name}</li>}
      />
    </div>
  );
}

const drawn = () => screen.queryAllByText(/^File \d+$/).length;

describe("WindowedFiles", () => {
  it("draws a short grid in full", () => {
    render(<Files count={WINDOW_FROM - 1} layout="grid" />);
    expect(drawn()).toBe(WINDOW_FROM - 1);
  });

  it.each(["grid", "list"] as const)("draws only the %s items around the screen", (layout) => {
    render(<Files count={5000} layout={layout} />);
    expect(drawn()).toBeGreaterThan(0);
    expect(drawn()).toBeLessThan(300);
    expect(screen.getByText("File 0")).toBeInTheDocument();
    expect(screen.queryByText("File 4999")).toBeNull();
  });

  it("fills each row of the grid with as many tiles as fit the width", () => {
    const { container } = render(<Files count={5000} layout="grid" />);
    const row = container.querySelector('[data-index="0"]');
    expect(row?.children).toHaveLength(4);
    expect(screen.getByText("File 3")).toBeInTheDocument();
  });
});
