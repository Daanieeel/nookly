import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ActionStatus } from "./action-feedback.tsx";
import { ConfirmPermanentDialog, matchesPhrase } from "./confirm-permanent-dialog.tsx";

function Harness({
  phrase,
  status = "idle",
  error,
  onConfirm,
}: {
  phrase?: string;
  status?: ActionStatus;
  error?: string;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open again
      </button>
      <ConfirmPermanentDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete Algebra forever?"
        description="This erases the Space and everything in it. This cannot be undone."
        stats={[
          { value: 12, label: "Items" },
          { value: 3, label: "Modules" },
        ]}
        phrase={phrase}
        actionLabel="Delete Space"
        errorLabel="Couldn't delete, try again"
        status={status}
        error={error}
        onConfirm={onConfirm}
      />
    </>
  );
}

function setup(props: Partial<Parameters<typeof Harness>[0]> = {}) {
  const onConfirm = vi.fn();
  const user = userEvent.setup();
  render(<Harness onConfirm={onConfirm} {...props} />);
  return { onConfirm, user };
}

describe("matchesPhrase", () => {
  it("ignores case and spaces around the phrase, nothing else", () => {
    expect(matchesPhrase("  delete ", "DELETE")).toBe(true);
    expect(matchesPhrase("Algebra", "algebra")).toBe(true);
    expect(matchesPhrase("Algebr", "Algebra")).toBe(false);
    expect(matchesPhrase("", "DELETE")).toBe(false);
    expect(matchesPhrase("del ete", "delete")).toBe(false);
  });
});

describe("ConfirmPermanentDialog", () => {
  it("names what is affected and shows the figures", () => {
    setup();
    expect(screen.getByRole("alertdialog", { name: /Delete Algebra forever/ })).toBeInTheDocument();
    expect(screen.getByText(/This cannot be undone/)).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Modules")).toBeInTheDocument();
  });

  it("confirms on one click when no phrase is asked for", async () => {
    const { user, onConfirm } = setup();
    await user.click(screen.getByRole("button", { name: "Delete Space" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("cannot be confirmed until the phrase is typed", async () => {
    const { user, onConfirm } = setup({ phrase: "Algebra" });
    const confirm = screen.getByRole("button", { name: "Delete Space" });
    expect(confirm).toBeDisabled();
    await user.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();

    await user.type(screen.getByRole("textbox", { name: "Type Algebra to confirm" }), "algebr");
    expect(confirm).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "Type Algebra to confirm" }), "a");
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("puts the cursor in the phrase field, not on a button", () => {
    setup({ phrase: "DELETE" });
    expect(screen.getByRole("textbox", { name: "Type DELETE to confirm" })).toHaveFocus();
  });

  it("does not confirm when Enter is pressed in the phrase field", async () => {
    const { user, onConfirm } = setup({ phrase: "DELETE" });
    await user.type(
      screen.getByRole("textbox", { name: "Type DELETE to confirm" }),
      "DELETE{Enter}",
    );
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("forgets the phrase once the dialog closes", async () => {
    const { user } = setup({ phrase: "DELETE" });
    await user.type(screen.getByRole("textbox", { name: "Type DELETE to confirm" }), "DELETE");
    expect(screen.getByRole("button", { name: "Delete Space" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Open again" }));
    expect(screen.getByRole("textbox", { name: "Type DELETE to confirm" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "Delete Space" })).toBeDisabled();
  });

  it("does not run twice while it is pending", async () => {
    const { user, onConfirm } = setup({ status: "pending" });
    await user.click(screen.getByRole("button", { name: /Delete Space/ }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("shows the failure and can be tried again", async () => {
    const { user, onConfirm } = setup({ status: "error", error: "disk is full" });
    expect(screen.getByText("disk is full")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Couldn't delete, try again/ }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
