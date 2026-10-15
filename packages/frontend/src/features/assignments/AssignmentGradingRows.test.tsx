import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { makeAssignment } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { AssignmentGradingRows } from "./AssignmentGradingRows.tsx";

beforeEach(() => {
  mockCommand("update_assignment_ungraded", null);
  mockCommand("update_assignment_status", null);
});

describe("AssignmentGradingRows", () => {
  it("shows Evaluation as Ungraded and no Grade field while ungraded", () => {
    renderWithProviders(<AssignmentGradingRows assignment={makeAssignment({ ungraded: true })} />);
    expect(screen.getByText("Evaluation")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ungraded" })).not.toHaveClass("text-caution");
    expect(screen.queryByText("Grade")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add grade" })).not.toBeInTheDocument();
  });

  it("turns to Graded in the caution color and shows the Grade field", async () => {
    const { user } = renderWithProviders(
      <AssignmentGradingRows assignment={makeAssignment({ ungraded: true })} />,
    );
    await user.click(screen.getByRole("button", { name: "Ungraded" }));
    await waitFor(() => expect(callsOf("update_assignment_ungraded")).toHaveLength(1));
    expect(callsOf("update_assignment_ungraded")[0]).toMatchObject({ ungraded: false });
  });

  it("shows the Grade field for a graded assignment, and Graded switches it to ungraded", async () => {
    const { user } = renderWithProviders(
      <AssignmentGradingRows assignment={makeAssignment({ ungraded: false, grade: 1.7 })} />,
    );
    expect(screen.getByRole("button", { name: "Graded" })).toHaveClass("text-caution");
    expect(screen.getByText("Grade")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Grade" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Graded" }));
    await waitFor(() => expect(callsOf("update_assignment_ungraded")).toHaveLength(1));
    expect(callsOf("update_assignment_ungraded")[0]).toMatchObject({ ungraded: true });
  });
});
