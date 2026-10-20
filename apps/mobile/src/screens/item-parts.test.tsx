import {
  createAssignment,
  createCourse,
  createExam,
  createSemester,
  createSpace,
  createTask,
  getEntity,
  type EntityRecord,
} from "@nookly/shared/data";
import { fireEvent } from "expo-router/testing-library";
import { useEffect, useState } from "react";
import { renderScreens, testData } from "../test/render.tsx";
import { type Part, PartProvider } from "../ui/parts.tsx";
import { useDb } from "../data/context.tsx";
import { ItemParts } from "./ItemParts.tsx";

function Item({ id, part }: { id: string; part: Part }) {
  const db = useDb();
  const [entity, setEntity] = useState<EntityRecord | null>(null);
  useEffect(() => void getEntity(db, id).then(setEntity), [db, id]);
  return entity ? (
    <PartProvider value={part}>
      <ItemParts entity={entity} readOnly={false} />
    </PartProvider>
  ) : null;
}

async function show(id: string, part: Part, data: ReturnType<typeof testData>) {
  return renderScreens({ index: () => <Item id={id} part={part} /> }, data);
}

describe("an item's page and its details", () => {
  it("keeps a task's description and sub-tasks in the page and its properties in the details", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Work", "#3b82f6");
    const id = await createTask(data.db, space, "Report");
    const page = await show(id, "main", data);
    expect(await page.findByText("Sub-tasks")).toBeTruthy();
    expect(page.queryByRole("button", { name: /^Status/ })).toBeNull();
    expect(page.queryByRole("button", { name: /^Due date/ })).toBeNull();
    page.unmount();
    const details = await show(id, "details", data);
    expect(await details.findByRole("button", { name: /^Status/ })).toBeTruthy();
    expect(details.getByRole("button", { name: /^Due date/ })).toBeTruthy();
    expect(details.queryByText("Sub-tasks")).toBeNull();
  });

  it("keeps a course's exams and assignments in the page and its professor in the details", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const course = await createCourse(data.db, space, "Algorithms");
    await createExam(data.db, space, "Midterm", course);
    await createAssignment(data.db, space, "Sheet 1", course);
    const page = await show(course, "main", data);
    expect(await page.findByText("Exams")).toBeTruthy();
    expect(page.getByText("Assignments")).toBeTruthy();
    expect(page.queryByLabelText("Professor")).toBeNull();
    page.unmount();
    const details = await show(course, "details", data);
    expect(await details.findByLabelText("Professor")).toBeTruthy();
    expect(details.queryByText("Exams")).toBeNull();
  });

  it("gives a course its bento tiles and an exam its decks, with a line to add one", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const course = await createCourse(data.db, space, "Algorithms");
    const exam = await createExam(data.db, space, "Midterm", course, "2099-01-10");
    await createAssignment(data.db, space, "Sheet 1", course, "2099-01-05");
    const courseScreen = await show(course, "main", data);
    expect(await courseScreen.findByText("Next Session")).toBeTruthy();
    expect(courseScreen.getByText("Next Exam")).toBeTruthy();
    expect(courseScreen.getByText("1 open / 1 total")).toBeTruthy();
    expect(courseScreen.getByText("Course Grade")).toBeTruthy();
    expect(courseScreen.getAllByRole("button", { name: "View all" }).length).toBe(3);
    courseScreen.unmount();
    const examScreen = await show(exam, "main", data);
    const field = await examScreen.findByLabelText("New deck");
    await fireEvent.changeText(field, "Midterm cards");
    await fireEvent(field, "submitEditing");
    expect(
      await examScreen.findByRole("button", { name: /^Midterm cards, 0 to study of 0/ }),
    ).toBeTruthy();
  });

  it("gives a semester its stats and a way to create a course in it", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const semester = await createSemester(data.db, space, { title: "WS 26/27" });
    const screen = await show(semester, "main", data);
    expect(await screen.findByText("sessions this week")).toBeTruthy();
    expect(screen.getByText("upcoming exams")).toBeTruthy();
    expect(screen.getByText("open assignments")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("New course"), "Logic");
    await fireEvent.press(screen.getByRole("button", { name: "Create & Link" }));
    expect(await screen.findByRole("button", { name: /^Logic, CRS-/ })).toBeTruthy();
  });
});
