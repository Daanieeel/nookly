import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NoMatchesNotice } from "#/components/module-view-header.tsx";

describe("NoMatchesNotice", () => {
  it("shows the empty state with what the filters left and a way to clear them", async () => {
    const onClear = vi.fn();
    render(<NoMatchesNotice text="No decks match these filters." onClear={onClear} />);

    expect(screen.getByText("No matches")).toBeInTheDocument();
    expect(screen.getByText("No decks match these filters.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("offers no button when there is nothing to clear", () => {
    render(<NoMatchesNotice text="No tasks match this view." />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
