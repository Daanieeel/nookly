import {
  createAssignment,
  createCourse,
  createExam,
  createSemester,
  createSpace,
  getExam,
  setCourseSemester,
  setCurrentSemester,
  updateExam,
} from "@nookly/shared/data";
import { fireEvent, waitFor } from "expo-router/testing-library";
import { renderScreens, testData } from "../test/render.tsx";
import { GradesScreen } from "./GradesScreen.tsx";

async function seeded() {
  const data = testData();
  const space = await createSpace(data.db, "Uni", "#3b82f6");
  const course = await createCourse(data.db, space, "Algorithms");
  const ws = await createSemester(data.db, space, { title: "WS 25/26" });
  await setCurrentSemester(data.db, space, ws);
  await setCourseSemester(data.db, course, ws);
  const exam = await createExam(data.db, space, "Final", course, "2026-02-01");
  await updateExam(data.db, exam, { grade: 1.7, weight: 0.6 });
  await createAssignment(data.db, space, "Sheet 1", course, "2026-01-10");
  return { data, space, course, exam };
}

describe("the grade report", () => {
  it("shows the cumulative and the current semester's average, each semester and each course", async () => {
    const { data, space } = await seeded();
    const screen = await renderScreens({ index: () => <GradesScreen spaceId={space} /> }, data);
    expect(await screen.findByText("Cumulative average")).toBeTruthy();
    expect(screen.getByText("Current semester")).toBeTruthy();
    expect(screen.getByText("WS 25/26, 1 graded course")).toBeTruthy();
    expect(screen.getByRole("button", { name: "WS 25/26" })).toBeTruthy();
    expect(screen.getByText("Current")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Algorithms, 1 of 2 graded" })).toBeTruthy();
  });

  it("changes an exam's grade and weight in place", async () => {
    const { data, space, exam } = await seeded();
    const screen = await renderScreens({ index: () => <GradesScreen spaceId={space} /> }, data);
    const grade = await screen.findByLabelText("Grade of Final");
    await fireEvent.changeText(grade, "1,3");
    await fireEvent(grade, "endEditing");
    await waitFor(async () => expect((await getExam(data.db, exam))?.grade).toBe(1.3));
    const weight = screen.getByLabelText("Weight of Final");
    await fireEvent.changeText(weight, "40");
    await fireEvent(weight, "endEditing");
    await waitFor(async () => expect((await getExam(data.db, exam))?.weight).toBe(0.4));
  });

  it("puts a typo back instead of saving it", async () => {
    const { data, space, exam } = await seeded();
    const screen = await renderScreens({ index: () => <GradesScreen spaceId={space} /> }, data);
    const grade = await screen.findByLabelText("Grade of Final");
    await fireEvent.changeText(grade, "abc");
    await fireEvent(grade, "endEditing");
    expect(screen.getByLabelText("Grade of Final").props.value).toBe("1.7");
    expect((await getExam(data.db, exam))?.grade).toBe(1.7);
  });

  it("explains an empty report", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const screen = await renderScreens({ index: () => <GradesScreen spaceId={space} /> }, data);
    expect(await screen.findByText(/No courses to report on yet/)).toBeTruthy();
  });
});
