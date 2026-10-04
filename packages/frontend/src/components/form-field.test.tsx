import { useForm } from "@tanstack/react-form";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Dialog, DialogContent, DialogTitle } from "@nookly/ui/components/dialog";
import { FormField, fieldMessage, hasVisibleErrors } from "./form-field.tsx";
import { NameFormField } from "./name-form-field.tsx";
import { SubmitDialogFooter } from "./submit-dialog-footer.tsx";

const meta = (isTouched: boolean, errors: (string | { message: string } | number | null)[]) => ({
  state: { meta: { isTouched, errors } },
});

describe("fieldMessage", () => {
  it("says nothing before the field is touched", () => {
    expect(fieldMessage(meta(false, ["Required"]))).toBeUndefined();
  });

  it("returns the first string error", () => {
    expect(fieldMessage(meta(true, ["Required", "Too short"]))).toBe("Required");
  });

  it("reads the message of a Zod style issue", () => {
    expect(fieldMessage(meta(true, [{ message: "Pick a date" }]))).toBe("Pick a date");
  });

  it("says nothing without errors or for an error it can't read", () => {
    expect(fieldMessage(meta(true, []))).toBeUndefined();
    expect(fieldMessage(meta(true, [42]))).toBeUndefined();
    expect(fieldMessage(meta(true, [null]))).toBeUndefined();
  });
});

describe("hasVisibleErrors", () => {
  it("is true only while a touched field has an error", () => {
    expect(hasVisibleErrors({ fieldMeta: {} })).toBe(false);
    expect(hasVisibleErrors({ fieldMeta: { a: { isTouched: false, errors: ["x"] } } })).toBe(false);
    expect(hasVisibleErrors({ fieldMeta: { a: { isTouched: true, errors: [] } } })).toBe(false);
    expect(
      hasVisibleErrors({
        fieldMeta: { a: undefined, b: { isTouched: true, errors: ["x"] } },
      }),
    ).toBe(true);
  });
});

describe("FormField", () => {
  it("labels its control and marks it required", () => {
    render(
      <FormField label="Title" htmlFor="t" required>
        <input id="t" />
      </FormField>,
    );
    expect(screen.getByLabelText(/Title/)).toBeInTheDocument();
    expect(screen.getByText("(required)")).toBeInTheDocument();
  });

  it("shows the error instead of the hint", () => {
    const { rerender } = render(
      <FormField label="Title" hint="Shown on cards" error={undefined}>
        <input />
      </FormField>,
    );
    expect(screen.getByText("Shown on cards")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    rerender(
      <FormField label="Title" hint="Shown on cards" error="Give it a title">
        <input />
      </FormField>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Give it a title");
    expect(screen.queryByText("Shown on cards")).not.toBeInTheDocument();
  });
});

/// A rename dialog body like the app's: one required Name and the shared footer.
function NameForm({ onSubmit }: { onSubmit: (title: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const form = useForm({
    defaultValues: { title: "" },
    validators: { onChange: z.object({ title: z.string().trim().min(1, "Name it first") }) },
    onSubmit: ({ value }) => onSubmit(value.title),
  });
  return (
    <Dialog open>
      <DialogContent>
        <DialogTitle>Rename</DialogTitle>
        <form.Field name="title">
          {(field) => (
            <NameFormField field={field} id="name" inputRef={inputRef} placeholder="e.g. Home" />
          )}
        </form.Field>
        <SubmitDialogFooter
          form={form}
          status="idle"
          label="Save"
          successLabel="Saved"
          errorLabel="Couldn't save"
        />
      </DialogContent>
    </Dialog>
  );
}

describe("NameFormField and SubmitDialogFooter", () => {
  it("enables the button on a fresh form, even though it is empty", () => {
    render(<NameForm onSubmit={() => {}} />);
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(screen.getByRole("textbox", { name: /Name/ })).toHaveAttribute(
      "placeholder",
      "e.g. Home",
    );
  });

  it("blocks submitting an empty name and says why", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<NameForm onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent("Name it first");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("disables the button while a touched field is invalid and enables it once fixed", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<NameForm onSubmit={onSubmit} />);
    const input = screen.getByRole("textbox", { name: /Name/ });
    await user.type(input, "a");
    await user.clear(input);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.type(input, "Uni");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledWith("Uni");
  });

  it("treats a blank name as empty", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<NameForm onSubmit={onSubmit} />);
    await user.type(screen.getByRole("textbox", { name: /Name/ }), "   ");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
