import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type {
  CourseReport,
  GradeItem,
  GradeReport,
  Semester,
  SemesterReport,
} from "#/lib/api/types.ts";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { makeEntity } from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, mockCommand, mockCommandWith } from "#/test/tauri.ts";
import { GradeReportView } from "./GradeReportView.tsx";

function item(patch: Partial<GradeItem> & { id: string; title: string }): GradeItem {
  const { id, title, ...rest } = patch;
  return {
    entity: makeEntity({ id, type: rest.kind ?? "exam", title }),
    kind: "exam",
    weight: null,
    share: 0.5,
    grade: null,
    status: "upcoming",
    date: null,
    ...rest,
  };
}

function course(id: string, title: string, items: GradeItem[], grade: number | null): CourseReport {
  return {
    course: makeEntity({ id, type: "course", title }),
    grades: {
      grade,
      gradedWeight: grade === null ? 0 : 1,
      gradedCount: items.filter((i) => i.grade !== null).length,
      itemCount: items.length,
    },
    items,
  };
}

function semester(title: string, isCurrent: boolean, year: number): Semester {
  return {
    entity: makeEntity({ id: title, type: "semester", title }),
    startDate: null,
    endDate: null,
    termType: "winter",
    year,
    isCurrent,
    manualPosition: null,
  };
}

const finalExam = item({
  id: "exam-1",
  title: "Final exam",
  weight: 0.6,
  share: 0.6,
  grade: 1.3,
  status: "done",
  date: "2026-02-01",
});
const sheet = item({
  id: "asg-1",
  title: "Sheet 1",
  kind: "assignment",
  share: 0.4,
  grade: 2.0,
  status: "graded",
  date: "2026-01-15",
});

const group = (
  semesterValue: Semester | null,
  courses: CourseReport[],
  gpa: number | null,
): SemesterReport => ({
  semester: semesterValue,
  gpa,
  gradedCourseCount: courses.filter((c) => c.grades.grade !== null).length,
  courses,
});

const report: GradeReport = {
  gpa: 1.8,
  semesters: [
    group(semester("WS 24", false, 2024), [course("c1", "Linear Algebra", [], 2.3)], 2.3),
    group(
      semester("WS 25", true, 2025),
      [
        course("c2", "Algorithms", [finalExam, sheet], 1.58),
        course("c3", "Logic", [item({ id: "exam-2", title: "Midterm" })], null),
      ],
      1.58,
    ),
    group(null, [course("c4", "Elective", [], 3)], 3),
  ],
};

function setup(value: GradeReport = report) {
  mockCommand("get_grade_report", value);
  mockCommand("update_exam_grade", null);
  mockCommand("update_exam_weight", null);
  mockCommand("update_assignment_status", null);
  mockCommand("update_assignment_weight", null);
  return renderWithProviders(<GradeReportView spaceId="space-1" />);
}

describe("GradeReportView", () => {
  it("shows the averages up top, and how they went over the semesters", async () => {
    setup();
    const cumulative = await screen.findByRole("group", { name: "Cumulative average" });
    expect(within(cumulative).getByText("1.8")).toBeInTheDocument();
    expect(within(cumulative).getByText("3 graded courses")).toBeInTheDocument();
    const current = screen.getByRole("group", { name: "Current semester" });
    expect(within(current).getByText("1.58")).toBeInTheDocument();
    expect(within(current).getByText("WS 25")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Semester averages: WS 24 2.3, WS 25 1.58" }),
    ).toBeInTheDocument();
  });

  it("leaves the trend out with fewer than two semesters to compare", async () => {
    setup({ ...report, semesters: report.semesters.slice(1) });
    await screen.findByRole("group", { name: "Cumulative average" });
    expect(screen.queryByRole("img", { name: /Semester averages/ })).not.toBeInTheDocument();
  });

  it("lists semesters chronologically, the courses in none last, with their averages", async () => {
    setup();
    const sections = await screen.findAllByRole("region");
    expect(sections.map((s) => s.getAttribute("aria-label"))).toEqual([
      "WS 24",
      "WS 25",
      "No semester",
    ]);
    const ws25 = within(sections[1]!);
    expect(ws25.getByText("Current")).toBeInTheDocument();
    expect(ws25.getByText("Average 1.58")).toBeInTheDocument();
    expect(within(sections[0]!).getByText("Average 2.3")).toBeInTheDocument();
  });

  it("opens the current semester with every course's work, the others folded", async () => {
    setup();
    const ws25 = within(await screen.findByRole("region", { name: "WS 25" }));
    const algorithms = within(ws25.getByRole("group", { name: "Algorithms" }));
    expect(algorithms.getByText("Final exam")).toBeInTheDocument();
    expect(algorithms.getByText("Sheet 1")).toBeInTheDocument();
    const logic = within(ws25.getByRole("group", { name: "Logic" }));
    expect(logic.getByText("Midterm")).toBeInTheDocument();
    // Past semesters only show their summary.
    const ws24 = within(screen.getByRole("region", { name: "WS 24" }));
    expect(ws24.getByRole("button", { name: /WS 24/ })).toHaveAttribute("aria-expanded", "false");
    expect(ws24.queryByText("Linear Algebra")).not.toBeInTheDocument();
  });

  it("opens a folded semester and remembers it", async () => {
    const { user, unmount } = setup();
    const ws24 = within(await screen.findByRole("region", { name: "WS 24" }));
    await user.click(ws24.getByRole("button", { name: /WS 24/ }));
    expect(ws24.getByText("Linear Algebra")).toBeInTheDocument();
    expect(ws24.getByText("No exams or assignments yet")).toBeInTheDocument();
    unmount();
    setup();
    const again = within(await screen.findByRole("region", { name: "WS 24" }));
    expect(again.getByText("Linear Algebra")).toBeInTheDocument();
  });

  it("shows each course's grade and how much of it is decided", async () => {
    setup();
    const ws25 = within(await screen.findByRole("region", { name: "WS 25" }));
    const algorithms = within(ws25.getByRole("group", { name: "Algorithms" }));
    expect(algorithms.getByText("1.58")).toBeInTheDocument();
    expect(algorithms.getByText("100% decided")).toBeInTheDocument();
    const logic = within(ws25.getByRole("group", { name: "Logic" }));
    expect(logic.getByText("No grade")).toBeInTheDocument();
    expect(logic.getByText("Nothing graded yet")).toBeInTheDocument();
  });

  it("lists a course's work in the order it happens", async () => {
    setup();
    const algorithms = within(await screen.findByRole("group", { name: "Algorithms" }));
    const titles = algorithms.getAllByRole("listitem").map((row) => row.textContent);
    expect(titles[0]).toContain("Sheet 1");
    expect(titles[1]).toContain("Final exam");
  });

  it("puts every grade and weight in an editable field, assignments' too", async () => {
    setup();
    expect(await screen.findByLabelText("Grade for Final exam")).toHaveValue("1.3");
    expect(screen.getByLabelText("Weight for Final exam")).toHaveValue("60");
    expect(screen.getByLabelText("Grade for Sheet 1")).toHaveValue("2");
    // No weight yet: it takes what the others leave, which the placeholder says.
    const weight = screen.getByLabelText("Weight for Sheet 1");
    expect(weight).toHaveValue("");
    expect(weight).toHaveAttribute("placeholder", "40");
    expect(
      within(screen.getByRole("listitem", { name: "Sheet 1" })).getByText("auto"),
    ).toBeInTheDocument();
  });

  it("saves an exam's grade when the field is left", async () => {
    const { user } = setup();
    const field = await screen.findByLabelText("Grade for Final exam");
    await user.clear(field);
    await user.type(field, "1,7");
    await user.tab();
    await waitFor(() =>
      expect(callsOf("update_exam_grade")).toEqual([{ entityId: "exam-1", grade: 1.7 }]),
    );
  });

  it("saves an assignment's grade with the status it already has", async () => {
    const { user } = setup();
    const field = await screen.findByLabelText("Grade for Sheet 1");
    await user.clear(field);
    await user.type(field, "1.0{Enter}");
    await waitFor(() =>
      expect(callsOf("update_assignment_status")).toEqual([
        { entityId: "asg-1", status: "graded", grade: 1 },
      ]),
    );
  });

  it("clears a grade", async () => {
    const { user } = setup();
    const field = await screen.findByLabelText("Grade for Final exam");
    await user.clear(field);
    await user.tab();
    await waitFor(() =>
      expect(callsOf("update_exam_grade")).toEqual([{ entityId: "exam-1", grade: null }]),
    );
  });

  it("saves an exam's weight as a fraction", async () => {
    const { user } = setup();
    const field = await screen.findByLabelText("Weight for Final exam");
    await user.clear(field);
    await user.type(field, "40");
    await user.tab();
    await waitFor(() =>
      expect(callsOf("update_exam_weight")).toEqual([{ entityId: "exam-1", weight: 0.4 }]),
    );
  });

  it("saves an assignment's weight as a fraction", async () => {
    const { user } = setup();
    const field = await screen.findByLabelText("Weight for Sheet 1");
    await user.type(field, "25");
    await user.tab();
    await waitFor(() =>
      expect(callsOf("update_assignment_weight")).toEqual([{ entityId: "asg-1", weight: 0.25 }]),
    );
    expect(callsOf("update_exam_weight")).toEqual([]);
  });

  it("doesn't save what isn't a number, and marks the field", async () => {
    const { user } = setup();
    const field = await screen.findByLabelText("Grade for Final exam");
    await user.clear(field);
    await user.type(field, "abc");
    await user.tab();
    expect(callsOf("update_exam_grade")).toEqual([]);
    expect(field).toHaveAttribute("aria-invalid", "true");
    await user.clear(field);
    await user.type(field, "2");
    expect(field).not.toHaveAttribute("aria-invalid");
  });

  it("doesn't save a weight over 100 or a negative grade", async () => {
    const { user } = setup();
    const weight = await screen.findByLabelText("Weight for Final exam");
    await user.clear(weight);
    await user.type(weight, "150");
    await user.tab();
    const grade = screen.getByLabelText("Grade for Final exam");
    await user.clear(grade);
    await user.type(grade, "-1");
    await user.tab();
    expect(callsOf("update_exam_weight")).toEqual([]);
    expect(callsOf("update_exam_grade")).toEqual([]);
  });

  it("doesn't save a field that didn't change", async () => {
    const { user } = setup();
    const field = await screen.findByLabelText("Grade for Final exam");
    await user.click(field);
    await user.tab();
    expect(callsOf("update_exam_grade")).toEqual([]);
  });

  it("shows a failed save on the field", async () => {
    const { user } = setup();
    mockCommandWith("update_exam_grade", () => {
      throw new Error("nope");
    });
    const field = await screen.findByLabelText("Grade for Final exam");
    await user.clear(field);
    await user.type(field, "2");
    await user.tab();
    await waitFor(() => expect(field).toHaveAttribute("aria-invalid", "true"));
  });

  it("says what to do when there is nothing to report", async () => {
    setup({ gpa: null, semesters: [] });
    expect(await screen.findByText("No courses to report on yet")).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    setup();
    await screen.findByRole("region", { name: "WS 25" });
    await expectNoA11yViolations();
  });
});
