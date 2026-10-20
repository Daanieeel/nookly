import {
  createAssignment,
  createCourse,
  createExam,
  createSpace,
  createTask,
  getEntity,
  type EntityRecord,
} from "@nookly/shared/data";
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
});
