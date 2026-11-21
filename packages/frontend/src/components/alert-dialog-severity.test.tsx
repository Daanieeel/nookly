import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  type AlertDialogSeverity,
} from "@nookly/ui/components/alert-dialog";

function Dialog({ severity, variant }: { severity?: AlertDialogSeverity; variant?: "secondary" }) {
  return (
    <AlertDialog open severity={severity}>
      <AlertDialogContent>
        <AlertDialogTitle>Title</AlertDialogTitle>
        <AlertDialogDescription>Description</AlertDialogDescription>
        <AlertDialogAction variant={variant}>Go</AlertDialogAction>
      </AlertDialogContent>
    </AlertDialog>
  );
}

describe("AlertDialog severity", () => {
  it.each(["caution", "warning", "destructive"] as const)(
    "gives the main action the %s button",
    (severity) => {
      render(<Dialog severity={severity} />);
      expect(screen.getByRole("button", { name: "Go" }).className).toContain(
        `--color-solid-${severity}`,
      );
    },
  );

  it("keeps the default button without a severity", () => {
    render(<Dialog />);
    expect(screen.getByRole("button", { name: "Go" }).className).not.toContain("--color-solid-");
  });

  it("lets an action's own variant win", () => {
    render(<Dialog severity="destructive" variant="secondary" />);
    expect(screen.getByRole("button", { name: "Go" }).className).not.toContain("--color-solid-");
  });
});
