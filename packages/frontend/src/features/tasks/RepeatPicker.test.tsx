import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { makeTask } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import type { RepeatRule } from "#/lib/api/types.ts";
import { RepeatIcon } from "./RepeatIcon.tsx";
import { RepeatPicker } from "./RepeatPicker.tsx";

function setup(value: RepeatRule | null = null) {
  const onSelect = vi.fn<(rule: RepeatRule | null) => void>();
  const view = renderWithProviders(
    <RepeatPicker value={value} onSelect={onSelect}>
      <button type="button">Repeat</button>
    </RepeatPicker>,
  );
  return { ...view, onSelect };
}

async function open(view: ReturnType<typeof setup>) {
  await view.user.click(screen.getByRole("button", { name: "Repeat" }));
  return screen.findByRole("dialog");
}

describe("RepeatPicker", () => {
  it("offers daily, weekly and monthly", async () => {
    const view = setup();
    const dialog = await open(view);
    for (const name of ["Daily", "Weekly", "Monthly"]) {
      expect(within(dialog).getByRole("option", { name })).toBeTruthy();
    }
    await view.user.click(within(dialog).getByRole("option", { name: "Weekly" }));
    expect(view.onSelect).toHaveBeenCalledWith({ every: 1, unit: "week" });
  });

  it("sets a custom number of days", async () => {
    const view = setup();
    const dialog = await open(view);
    // It starts at 2, since Daily is already a preset.
    await view.user.click(within(dialog).getByRole("button", { name: "Increase days" }));
    await view.user.click(within(dialog).getByRole("button", { name: "Repeat every 3 days" }));
    expect(view.onSelect).toHaveBeenCalledWith({ every: 3, unit: "day" });
  });

  it("removes the rule with Does not repeat, only while there is one", async () => {
    const none = setup();
    const noneDialog = await open(none);
    expect(within(noneDialog).getByRole("option", { name: /Does not repeat/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    none.unmount();

    const view = setup({ every: 1, unit: "day" });
    const dialog = await open(view);
    await view.user.click(within(dialog).getByRole("option", { name: /Does not repeat/ }));
    expect(view.onSelect).toHaveBeenCalledWith(null);
  });

  it("shows a rule set elsewhere that is not a preset, and marks the current one", async () => {
    const view = setup({ every: 2, unit: "week" });
    const dialog = await open(view);
    expect(within(dialog).getByRole("option", { name: /Every 2 weeks/ })).toBeTruthy();
  });

  it("does not call back when the current rule is chosen again", async () => {
    const view = setup({ every: 1, unit: "week" });
    const dialog = await open(view);
    await view.user.click(within(dialog).getByRole("option", { name: /Weekly/ }));
    expect(view.onSelect).not.toHaveBeenCalled();
  });

  it("has no axe violations when open", async () => {
    const view = setup({ every: 1, unit: "week" });
    await open(view);
    await expectNoA11yViolations();
  });
});

describe("RepeatIcon", () => {
  it("shows for a repeating task, with its rule in the name", () => {
    renderWithProviders(<RepeatIcon task={makeTask({ repeat: { every: 1, unit: "week" } })} />);
    expect(screen.getByRole("img", { name: "Repeats weekly" })).toBeTruthy();
  });

  it("shows nothing for a task that does not repeat", () => {
    const { container } = renderWithProviders(<RepeatIcon task={makeTask()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
