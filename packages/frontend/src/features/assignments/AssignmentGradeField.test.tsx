import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { makeAssignment } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { AssignmentGradeField } from "./AssignmentGradeField.tsx";

beforeEach(() => {
  mockCommand("update_assignment_ungraded", null);
  mockCommand("update_assignment_status", null);
});

describe("AssignmentGradeField", () => {
  it("offers None next to adding a grade", async () => {
    const { user } = renderWithProviders(<AssignmentGradeField assignment={makeAssignment()} />);
    expect(screen.getByRole("button", { name: "Add grade" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "None" }));
    await waitFor(() => expect(callsOf("update_assignment_ungraded")).toHaveLength(1));
    expect(callsOf("update_assignment_ungraded")[0]).toMatchObject({ ungraded: true });
  });

  it("shows None for an ungraded assignment and can count it again", async () => {
    const { user } = renderWithProviders(
      <AssignmentGradeField assignment={makeAssignment({ ungraded: true })} />,
    );
    expect(screen.getByText("None")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add grade" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Count towards grade" }));
    await waitFor(() => expect(callsOf("update_assignment_ungraded")).toHaveLength(1));
    expect(callsOf("update_assignment_ungraded")[0]).toMatchObject({ ungraded: false });
  });

  it("shows a grade as before, without None", () => {
    renderWithProviders(<AssignmentGradeField assignment={makeAssignment({ grade: 1.7 })} />);
    expect(screen.getByRole("button", { name: "Remove Grade" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "None" })).not.toBeInTheDocument();
  });
});
