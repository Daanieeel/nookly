import {
  addFile,
  createRelationship,
  createPage,
  linkedItems,
  listBlocks,
  updateBlock,
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
  createOneOffSession,
  createAssignment,
  getAssignment,
} from "@nookly/shared/data";
import { router } from "expo-router";
import { act, fireEvent, waitFor } from "expo-router/testing-library";
import { Text } from "react-native";
import { renderScreens, testData } from "../test/render.tsx";
import { choose, pickDay, pickDayInSheet, pickTime } from "../test/sheet.ts";
import { ConflictBadge } from "./ConflictBadge.tsx";
import { MergeEditor } from "./MergeEditor.tsx";
import { EntityScreen } from "./EntityScreen.tsx";
import { NewExamScreen } from "./NewScreens.tsx";
import { LinkPicker } from "./RelatedSection.tsx";
import { StudyScreen } from "./StudyScreen.tsx";

async function seeded() {
  const data = testData();
  const space = await createSpace(data.db, "Uni", "#3b82f6");
  const course = await createCourse(data.db, space, "Algorithms");
  return { data, space, course };
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
    await choose(screen, "Status", "Studying");
    await pickDay(screen, "Day", "2027-02-10");
    await pickTime(screen, "Time", "09:30");
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
    await choose(screen, "Course", "Algorithms");
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

describe("undoing an answer while studying", () => {
  it("brings the card back as it was, with the answer to give again", async () => {
    const { data, space } = await seeded();
    const deck = await createDeck(data.db, space, "Sorting");
    await createCard(data.db, deck, "Quicksort average?", "n log n");
    const screen = await renderScreens({ index: () => <StudyScreen deckId={deck} /> }, data);
    await fireEvent.press(await screen.findByRole("button", { name: "Show Answer" }));
    await fireEvent.press(screen.getByRole("button", { name: "Easy" }));
    expect(await screen.findByText("All done for now")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Undo Last Answer" }));
    expect(await screen.findByText("Quicksort average?")).toBeTruthy();
    const [card] = await listCards(data.db, deck);
    expect([card.state, card.reps]).toEqual(["new", 0]);
    expect(screen.queryByRole("button", { name: "Undo Last Answer" })).toBeNull();
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
    await pickDay(screen, "Due date", "2026-10-31");
    await waitFor(async () => expect((await getTask(data.db, task))?.dueDate).toBe("2026-10-31"));
    await fireEvent.press(await screen.findByRole("button", { name: "Labels, None" }));
    await fireEvent.changeText(await screen.findByLabelText("Search Labels"), "Urgent");
    await fireEvent.press(screen.getByRole("button", { name: "Create Urgent" }));
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
      { index: () => <Text>Report page</Text>, link: () => <LinkPicker entityId={task} /> },
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

  it("invites a look from the page the change belongs to, and nowhere else", async () => {
    const { data, task } = await disagreement();
    data.sync.store.setState((state) => ({ status: { ...state.status, conflicts: 1 } }));
    const screen = await renderScreens({ index: () => <ConflictBadge entityId={task} /> }, data);
    expect(
      await screen.findByRole("button", { name: "1 change needs a look. Review" }),
    ).toBeTruthy();
    const other = await renderScreens({ index: () => <ConflictBadge entityId="other" /> }, data);
    await waitFor(() => expect(other.queryByRole("button", { name: /needs a look/ })).toBeNull());
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

describe("an item's links", () => {
  it("shows each link as it reads from this item, and attachments and mentions apart", async () => {
    const { data, space } = await seeded();
    const task = await createTask(data.db, space, "Write");
    const review = await createTask(data.db, space, "Review");
    const file = await addFile(data.db, space, "spec.pdf", "file:///spec.pdf");
    await createRelationship(data.db, task, review, "blocks");
    await createRelationship(data.db, task, file, "attached-file");
    const page = await createPage(data.db, space, "note", "Plan");
    await updateBlock(
      data.db,
      (await listBlocks(data.db, page))[0].id,
      `Do [Write](mention:${task}) first.`,
    );
    const screen = await renderScreens(
      { "entity/[id]": () => <EntityScreen id={task} /> },
      data,
      `/entity/${task}`,
    );
    expect(await screen.findByRole("button", { name: /^Review, Blocks · / })).toBeTruthy();
    expect(screen.getByText("Attachments")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^spec.pdf, Attached file · / })).toBeTruthy();
    expect(await screen.findByText("Mentioned in")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Plan, / })).toBeTruthy();
  });

  it("links with the kind of link chosen", async () => {
    const { data, space } = await seeded();
    const task = await createTask(data.db, space, "Write");
    const other = await createTask(data.db, space, "Review");
    const screen = await renderScreens(
      { index: () => <Text>Task page</Text>, link: () => <LinkPicker entityId={task} /> },
      data,
    );
    await act(() => router.push("/link"));
    await choose(screen, "Kind of link", "Blocks");
    await fireEvent.changeText(screen.getByLabelText("Find an item"), "Review");
    await fireEvent.press(await screen.findByRole("button", { name: /^Review, / }));
    await waitFor(async () =>
      expect((await linkedItems(data.db, task)).map((l) => [l.type.name, l.entity.id])).toEqual([
        ["blocks", other],
      ]),
    );
  });
});

describe("an assignment's due date", () => {
  it("can be a number of days before a session, which then moves the day with it", async () => {
    const { data, space, course } = await seeded();
    const assignment = await createAssignment(data.db, space, "Sheet 1", course, "2026-01-01");
    await createOneOffSession(data.db, space, {
      title: "Lecture",
      courseId: course,
      date: "2999-03-10",
      startTime: "10:00",
      endTime: "11:30",
    });
    const screen = await renderScreens(
      { "entity/[id]": () => <EntityScreen id={assignment} /> },
      data,
      `/entity/${assignment}`,
    );
    await fireEvent.press(await screen.findByRole("button", { name: /^Due date, / }));
    await fireEvent.press(await screen.findByRole("button", { name: "Before session" }));
    // A step of the same sheet, with a way back.
    expect(await screen.findByRole("button", { name: "Back" })).toBeTruthy();
    await fireEvent.press(await screen.findByRole("radio", { name: "1 day" }));
    await waitFor(async () =>
      expect(await getAssignment(data.db, assignment)).toMatchObject({
        dueSessionOffsetDays: 1,
        dueDate: "2999-03-09",
      }),
    );
    await fireEvent.press(await screen.findByRole("button", { name: /^Due date, / }));
    await fireEvent.press(await screen.findByRole("button", { name: "Before session" }));
    await fireEvent.press(await screen.findByRole("radio", { name: "1 week" }));
    await waitFor(async () =>
      expect((await getAssignment(data.db, assignment))?.dueDate).toBe("2999-03-03"),
    );
    await fireEvent.press(await screen.findByRole("button", { name: /^Due date, / }));
    await fireEvent.press(await screen.findByRole("button", { name: "Specific date" }));
    const day = `${new Date().toISOString().slice(0, 7)}-15`;
    await pickDayInSheet(screen, day);
    await waitFor(async () =>
      expect(await getAssignment(data.db, assignment)).toMatchObject({
        dueSessionOffsetDays: null,
        dueDate: day,
      }),
    );
  });
});
