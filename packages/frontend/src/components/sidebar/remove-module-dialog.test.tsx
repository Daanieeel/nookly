import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { mockCommand, callsOf } from "#/test/tauri.ts";
import { RemoveModuleDialog } from "./remove-module-dialog.tsx";

function setup(module: "tasks" | "grades") {
  mockCommand("remove_space_module", null);
  return renderWithProviders(
    <RemoveModuleDialog spaceId="space-1" module={module} open onOpenChange={() => {}} />,
  );
}

describe("RemoveModuleDialog", () => {
  it("offers to hide a module or move its content to Trash", async () => {
    setup("tasks");
    expect(await screen.findByRole("button", { name: "Hide and Keep Data" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move to Trash" })).toBeInTheDocument();
    await expectNoA11yViolations();
  });

  it("only hides the Grades module, which holds no data of its own", async () => {
    const { user } = setup("grades");
    expect(screen.queryByRole("button", { name: "Move to Trash" })).not.toBeInTheDocument();
    expect(await screen.findByText(/holds no data of its own/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hide" }));
    await waitFor(() =>
      expect(callsOf("remove_space_module")).toEqual([
        { spaceId: "space-1", moduleKey: "grades", deleteContent: false },
      ]),
    );
    await expectNoA11yViolations();
  });
});
