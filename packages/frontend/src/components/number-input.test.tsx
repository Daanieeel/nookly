import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NumberInput } from "@nookly/ui/components/number-input";
import { renderWithProviders } from "#/test/render.tsx";

describe("NumberInput", () => {
  it("moves the buttons by the step unless increments say otherwise", async () => {
    const onChange = vi.fn();
    const { user, rerender } = renderWithProviders(
      <NumberInput value={10} onChange={onChange} step={5} aria-label="Length" />,
    );
    await user.click(screen.getByRole("button", { name: "Increase Length" }));
    expect(onChange).toHaveBeenLastCalledWith(15);
    rerender(
      <NumberInput value={10} onChange={onChange} step={5} increments={30} aria-label="Length" />,
    );
    await user.click(screen.getByRole("button", { name: "Increase Length" }));
    expect(onChange).toHaveBeenLastCalledWith(40);
    await user.click(screen.getByRole("button", { name: "Decrease Length" }));
    expect(onChange).toHaveBeenLastCalledWith(-20);
  });

  it("keeps the bounds when stepping", async () => {
    const onChange = vi.fn();
    const { user } = renderWithProviders(
      <NumberInput value={10} onChange={onChange} min={5} max={12} increments={10} />,
    );
    await user.click(screen.getByRole("button", { name: "Decrease" }));
    expect(onChange).toHaveBeenLastCalledWith(5);
    await user.click(screen.getByRole("button", { name: "Increase" }));
    expect(onChange).toHaveBeenLastCalledWith(12);
  });

  it("lets a number below the minimum be typed on the way to a valid one", async () => {
    function Harness() {
      return <NumberInput value={90} onChange={() => {}} min={5} aria-label="Length" />;
    }
    const { user } = renderWithProviders(<Harness />);
    const input = screen.getByRole("spinbutton", { name: "Length" });
    await user.clear(input);
    await user.type(input, "4");
    expect(input).toHaveValue(4);
    await user.type(input, "5");
    expect(input).toHaveValue(45);
  });
});
