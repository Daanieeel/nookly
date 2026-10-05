import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { formatDate } from "#/lib/datetime.ts";
import { TooltipProvider } from "@nookly/ui/components/tooltip";
import { DEFAULT_REPEAT } from "#/lib/repeat.ts";
import { type Repeat, RepeatChip } from "./repeat-chip.tsx";

/// The chip with its value held like a form holds it, reporting every change.
function Harness({ initial, onChange }: { initial: Repeat; onChange: (value: Repeat) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <RepeatChip
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

function setup(initial: Repeat = DEFAULT_REPEAT) {
  const onChange = vi.fn<(value: Repeat) => void>();
  const user = userEvent.setup();
  render(
    <TooltipProvider>
      <Harness initial={initial} onChange={onChange} />
    </TooltipProvider>,
  );
  return { onChange, user };
}

describe("RepeatChip", () => {
  it("shows only the interval while it doesn't repeat", () => {
    setup();
    expect(screen.getByRole("button", { name: "Repeat interval" })).toHaveTextContent(
      "Does not repeat",
    );
    expect(screen.queryByRole("button", { name: "Repeat duration" })).not.toBeInTheDocument();
    expect(screen.queryByText("for")).not.toBeInTheDocument();
  });

  it("offers every cadence", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Repeat interval" }));
    expect(screen.getAllByRole("menuitemradio").map((i) => i.textContent)).toEqual([
      "Does not repeat",
      "Daily",
      "Weekly",
      "Monthly",
    ]);
  });

  it("picks a cadence and then shows how long it runs", async () => {
    const { user, onChange } = setup();
    await user.click(screen.getByRole("button", { name: "Repeat interval" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Weekly" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_REPEAT, cadence: "weekly" });
    expect(screen.getByRole("button", { name: "Repeat interval" })).toHaveTextContent("Weekly");
    expect(screen.getByRole("button", { name: "Repeat duration" })).toHaveTextContent("16");
    expect(screen.getByRole("button", { name: "Repeat duration unit" })).toHaveTextContent("weeks");
  });

  it("changes the duration unit", async () => {
    const { user, onChange } = setup({
      ...DEFAULT_REPEAT,
      cadence: "daily",
      durationCount: 3,
      durationUnit: "weeks",
    });
    await user.click(screen.getByRole("button", { name: "Repeat duration unit" }));
    expect(screen.getAllByRole("menuitemradio").map((i) => i.textContent)).toEqual([
      "days",
      "weeks",
      "months",
      "years",
    ]);
    await user.click(screen.getByRole("menuitemradio", { name: "months" }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULT_REPEAT,
      cadence: "daily",
      durationCount: 3,
      durationUnit: "months",
    });
  });

  it("changes the duration count", async () => {
    const { user, onChange } = setup({
      ...DEFAULT_REPEAT,
      cadence: "monthly",
      durationCount: 6,
      durationUnit: "months",
    });
    await user.click(screen.getByRole("button", { name: "Repeat duration" }));
    const input = await screen.findByRole("spinbutton");
    fireEvent.change(input, { target: { value: "9" } });
    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULT_REPEAT,
      cadence: "monthly",
      durationCount: 9,
      durationUnit: "months",
    });
    expect(screen.getByRole("button", { name: "Repeat duration" })).toHaveTextContent("9");
  });

  it("keeps the duration between 1 and 999", async () => {
    const { user, onChange } = setup({
      ...DEFAULT_REPEAT,
      cadence: "monthly",
      durationCount: 6,
      durationUnit: "months",
    });
    await user.click(screen.getByRole("button", { name: "Repeat duration" }));
    const input = await screen.findByRole("spinbutton");
    fireEvent.change(input, { target: { value: "5000" } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ durationCount: 999 }));
    // Clearing the field reads as 0, which clamps to the minimum.
    await user.clear(input);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ durationCount: 1 }));
  });

  it("hides the duration again once it stops repeating", async () => {
    const { user } = setup({
      ...DEFAULT_REPEAT,
      cadence: "weekly",
      durationCount: 4,
      durationUnit: "weeks",
    });
    await user.click(screen.getByRole("button", { name: "Repeat interval" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Does not repeat" }));
    expect(screen.queryByRole("button", { name: "Repeat duration" })).not.toBeInTheDocument();
  });

  it("swaps for to until, asking for a date instead of a duration", async () => {
    const { user, onChange } = setup({ ...DEFAULT_REPEAT, cadence: "weekly" });
    await user.click(screen.getByRole("button", { name: "Repeat end type" }));
    expect(screen.getAllByRole("menuitemradio").map((i) => i.textContent)).toEqual([
      "for",
      "until",
    ]);
    await user.click(screen.getByRole("menuitemradio", { name: "until" }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULT_REPEAT,
      cadence: "weekly",
      endMode: "until",
    });
    expect(screen.getByRole("button", { name: "Repeat end type" })).toHaveTextContent("until");
    expect(screen.getByRole("button", { name: "Repeat until date" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Repeat duration" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Repeat duration unit" })).not.toBeInTheDocument();
  });

  it("picks the until date", async () => {
    const { user, onChange } = setup({
      ...DEFAULT_REPEAT,
      cadence: "weekly",
      endMode: "until",
      until: "2026-03-10",
    });
    await user.click(screen.getByRole("button", { name: "Repeat until date" }));
    await user.click(
      await screen.findByRole("gridcell", { name: formatDate(new Date(2026, 2, 20)) }),
    );
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ until: "2026-03-20" }));
  });

  it("goes back to for and keeps the duration it had", async () => {
    const { user, onChange } = setup({
      ...DEFAULT_REPEAT,
      cadence: "weekly",
      endMode: "until",
      durationCount: 8,
    });
    await user.click(screen.getByRole("button", { name: "Repeat end type" }));
    await user.click(screen.getByRole("menuitemradio", { name: "for" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ endMode: "for", durationCount: 8 }),
    );
    expect(screen.getByRole("button", { name: "Repeat duration" })).toHaveTextContent("8");
  });
});
