import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { type EditScope, EditFormActions, EditScopeTabs } from "./popover-parts.tsx";

function Scopes({ onChange }: { onChange: (scope: EditScope) => void }) {
  const [scope, setScope] = useState<EditScope>("this");
  return (
    <EditScopeTabs
      value={scope}
      onChange={(next) => {
        setScope(next);
        onChange(next);
      }}
    />
  );
}

describe("EditScopeTabs", () => {
  it("names the three scopes, starting on this occurrence only", () => {
    render(<Scopes onChange={() => {}} />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Only this",
      "This and after",
      "Upcoming after today",
    ]);
    expect(screen.getByRole("tab", { name: "Only this" })).toHaveAttribute("aria-selected", "true");
  });

  it("reports the picked scope", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Scopes onChange={onChange} />);
    await user.click(screen.getByRole("tab", { name: "This and after" }));
    expect(onChange).toHaveBeenLastCalledWith("following");
    await user.click(screen.getByRole("tab", { name: "Upcoming after today" }));
    expect(onChange).toHaveBeenLastCalledWith("upcoming");
    expect(screen.getByRole("tab", { name: "Upcoming after today" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});

describe("EditFormActions", () => {
  it("cancels and blocks saving while invalid", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    const { rerender } = render(<EditFormActions blocked status="idle" onDone={onDone} />);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDone).toHaveBeenCalledOnce();
    rerender(<EditFormActions blocked={false} status="error" onDone={onDone} />);
    expect(screen.getByRole("button", { name: /Couldn't save, try again/ })).toBeEnabled();
  });
});
