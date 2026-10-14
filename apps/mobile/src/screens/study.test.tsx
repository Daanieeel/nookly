import {
  createCard,
  createCourse,
  createDeck,
  createExam,
  createSpace,
  createTask,
  entityLabels,
  getEntity,
  getExam,
  getTask,
  listCards,
  listExams,
  relatedItems,
} from "@nookly/shared/data";
import { router } from "expo-router";
import { act, fireEvent, waitFor } from "expo-router/testing-library";
import { Text } from "react-native";
import { renderScreens, testData } from "../test/render.tsx";
import { MergeEditor } from "./MergeEditor.tsx";
import { EntityScreen } from "./EntityScreen.tsx";
import { NewExamScreen } from "./NewScreens.tsx";
import { LinkPickerScreen } from "./RelatedSection.tsx";
import { StudyScreen } from "./StudyScreen.tsx";

async function seeded() {
  const data = testData();
  const space = await createSpace(data.db, "Uni", "#3b82f6");
  const course = await createCourse(data.db, space, "Algorithms");
  return { data, space, course };
}

/// Picks a value in the system picker a field opened.
async function pick(screen: Awaited<ReturnType<typeof renderScreens>>, label: string, date: Date) {
  await fireEvent.press(screen.getByRole("button", { name: new RegExp(`^${label},`) }));
  const picker = await screen.findByTestId(`${label} picker`);
  await fireEvent(picker, "change", { nativeEvent: { timestamp: date.getTime(), utcOffset: 0 } });
}

describe("an exam", () => {
  it("changes its status, day, time and grade", async () => {
    const { data, space, course } = await seeded();
    const exam = await createExam(data.db, space, "Final", course);
    const screen = await renderScreens(
      { "entity/[id]": () => <EntityScreen id={exam} /> },
      data,
      `/entity/${exam}`,
    );
    await fireEvent.press(await screen.findByRole("radio", { name: "Studying" }));
    await pick(screen, "Day", new Date(2027, 1, 10));
    await pick(screen, "Time", new Date(2027, 1, 10, 9, 30));
    await fireEvent.changeText(screen.getByLabelText("Grade"), "1,7");
    await fireEvent(screen.getByLabelText("Grade"), "endEditing");
    await waitFor(async () =>
      expect(await getExam(data.db, exam)).toMatchObject({
        status: "studying",
        examDate: "2027-02-10",
        examTime: "09:30",
        grade: 1.7,
      }),
    );
  });

  it("is made in a Course, which it asks for", async () => {
    const { data, space, course } = await seeded();
    const screen = await renderScreens(
      {
        index: () => <NewExamScreen spaceId={space} />,
        "entity/[id]": () => null,
      },
      data,
    );
    await fireEvent.changeText(await screen.findByLabelText("Title"), "Midterm");
    await fireEvent.press(screen.getByRole("button", { name: "Create Exam" }));
    expect(await screen.findByText("Pick its Course.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("radio", { name: "Algorithms" }));
    await fireEvent.press(screen.getByRole("button", { name: /Create Exam|Couldn't create/ }));
    await waitFor(async () =>
      expect((await listExams(data.db, { courseId: course })).map((e) => e.entity.title)).toEqual([
        "Midterm",
      ]),
    );
  });
});

describe("studying a deck", () => {
  it("shows the answer, takes a rating and ends when nothing is due", async () => {
    const { data, space } = await seeded();
    const deck = await createDeck(data.db, space, "Sorting");
    const card = await createCard(data.db, deck, "Quicksort average?", "n log n");
    const screen = await renderScreens({ index: () => <StudyScreen deckId={deck} /> }, data);
    expect(await screen.findByText("Quicksort average?")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Show Answer" }));
    expect(screen.getByText("n log n")).toBeTruthy();
    // A new card rated Easy comes back in days, so the session ends.
    await fireEvent.press(screen.getByRole("button", { name: "Easy" }));
    expect(await screen.findByText("All done for now")).toBeTruthy();
    const [studied] = await listCards(data.db, deck);
    expect([studied.id, studied.state, studied.reps]).toEqual([card, "review", 1]);
  });
});

describe("a task's due date, labels and links", () => {
  it("picks the day from the calendar and adds a label", async () => {
    const { data, space } = await seeded();
    const task = await createTask(data.db, space, "Report");
    const screen = await renderScreens(
      { "entity/[id]": () => <EntityScreen id={task} /> },
      data,
      `/entity/${task}`,
    );
    await screen.findByText("Status");
    await pick(screen, "Due date", new Date(2026, 9, 31));
    await waitFor(async () => expect((await getTask(data.db, task))?.dueDate).toBe("2026-10-31"));
    await fireEvent.changeText(screen.getByLabelText("New label"), "Urgent");
    await fireEvent.press(screen.getByRole("button", { name: "Add" }));
    await waitFor(async () =>
      expect((await entityLabels(data.db, task)).map((l) => l.name)).toEqual(["Urgent"]),
    );
    expect(await screen.findByRole("checkbox", { name: "Urgent" })).toBeTruthy();
  });

  it("links an item found by search, then goes back", async () => {
    const { data, space } = await seeded();
    const task = await createTask(data.db, space, "Report");
    const other = await createTask(data.db, space, "Slides");
    const screen = await renderScreens(
      { index: () => <Text>Report page</Text>, link: () => <LinkPickerScreen entityId={task} /> },
      data,
    );
    await act(() => router.push("/link"));
    await fireEvent.changeText(await screen.findByLabelText("Find an item"), "Slides");
    await fireEvent.press(await screen.findByRole("button", { name: "Slides, TSK-2" }));
    await waitFor(async () =>
      expect((await relatedItems(data.db, task)).map((r) => r.entity.id)).toEqual([other]),
    );
    expect(await screen.findByText("Report page")).toBeTruthy();
  });
});

describe("the merge editor", () => {
  async function disagreement() {
    const { data, space } = await seeded();
    const task = await createTask(data.db, space, "New title");
    data.driver.rows(
      "INSERT INTO sync_conflicts (id, tbl, pk, field, losing_value, created_at) VALUES ('c1', 'entities', ?, 'title', ?, '2026-10-14T09:00:00Z')",
      task,
      JSON.stringify("Old title"),
    );
    return { data, task };
  }

  it("lists the change, shows both versions, and keeps the other one", async () => {
    const { data, task } = await disagreement();
    const screen = await renderScreens({ index: () => <MergeEditor /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "New title, Title" }));
    expect(await screen.findByLabelText("Another device's version: Old title")).toBeTruthy();
    expect(screen.getByText("Showing now")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Keep the Other" }));
    await waitFor(async () => expect((await getEntity(data.db, task))?.title).toBe("Old title"));
    expect(await screen.findByText("Nothing needs a look.")).toBeTruthy();
  });

  it("keeps both: combines them to edit, and saves what is written", async () => {
    const { data, task } = await disagreement();
    const screen = await renderScreens({ index: () => <MergeEditor /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "New title, Title" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Keep Both" }));
    const box = screen.getByLabelText("Combined version");
    expect(box.props.value).toBe("New title / Old title");
    await fireEvent.changeText(box, "Old and new title");
    await fireEvent.press(screen.getByRole("button", { name: "Save Combined" }));
    await waitFor(async () =>
      expect((await getEntity(data.db, task))?.title).toBe("Old and new title"),
    );
  });
});
