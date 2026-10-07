import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@nookly/ui/components/dialog";
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "#/test/render.tsx";
import { IconPicker } from "./icon-picker.tsx";
import { SelectField } from "./select-field.tsx";

const OPTIONS = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
];

// The dialog's scroll lock swallows wheel and touch moves from portaled popovers,
// so every popover that opens inside a dialog keeps them (issue #83).
describe.each([
  [
    "SelectField",
    <SelectField key="s" aria-label="Pick one" options={OPTIONS} value="a" onChange={() => {}} />,
    "Pick one",
  ],
  [
    "IconPicker",
    <IconPicker
      key="i"
      value={null}
      onChange={() => {}}
      trigger={<button type="button">Pick icon</button>}
    />,
    "Pick icon",
  ],
])("%s in a dialog", (_name, field, trigger) => {
  it.each(["wheel", "touchmove"])("keeps %s inside the popover", async (type) => {
    const { user } = renderWithProviders(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Create</DialogTitle>
          <DialogDescription>Fields</DialogDescription>
          {field}
        </DialogContent>
      </Dialog>,
    );
    await user.click(await screen.findByRole("button", { name: trigger }));
    await waitFor(() =>
      expect(document.querySelector("[data-radix-popper-content-wrapper] > *")).toBeTruthy(),
    );
    const inner = document.querySelector("[data-radix-popper-content-wrapper] > *")!;
    const reachedDocument = vi.fn();
    document.addEventListener(type, reachedDocument);
    inner.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
    document.removeEventListener(type, reachedDocument);
    expect(reachedDocument).not.toHaveBeenCalled();
  });
});
