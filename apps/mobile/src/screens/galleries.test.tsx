import {
  createAssignment,
  createCard,
  createCourse,
  createDeck,
  createExam,
  createSemester,
  createSpace,
  setCourseSemester,
  setCurrentSemester,
} from "@nookly/shared/data";
import { fireEvent } from "expo-router/testing-library";
import { renderScreens, testData } from "../test/render.tsx";
import { addDays, localDay } from "./dates.ts";
import { CourseGallery, DeckGrid, ExamTimeline } from "./StudyGalleries.tsx";

describe("the Courses gallery", () => {
  it("groups cards under a band per semester, the current one Active, loose ones last", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const winter = await createSemester(data.db, space, { title: "Winter 26" });
    await setCurrentSemester(data.db, space, winter);
    const algo = await createCourse(data.db, space, "Algorithms");
    await createCourse(data.db, space, "Loose course");
    await setCourseSemester(data.db, algo, winter);
    await createAssignment(data.db, space, "Sheet 1", algo, addDays(localDay(), 5));
    const screen = await renderScreens({ index: () => <CourseGallery spaceId={space} /> }, data);
    expect(await screen.findByRole("button", { name: "Winter 26" })).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByRole("button", { name: "No semester" })).toBeTruthy();
    expect(await screen.findByText("Assignments 0/1 · due 5d")).toBeTruthy();
    expect(screen.getAllByText("No sessions").length).toBe(2);
    await fireEvent.press(screen.getByRole("button", { name: "Winter 26" }));
    expect(screen.queryByRole("button", { name: "Algorithms" })).toBeNull();
  });
});

describe("the Exams timeline", () => {
  it("puts the next exam on a highlighted card with the days to go", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const course = await createCourse(data.db, space, "Algorithms");
    await createExam(data.db, space, "Midterm", course, addDays(localDay(), 12));
    await createExam(data.db, space, "Final", course, addDays(localDay(), 60));
    await createExam(data.db, space, "Quiz", course, addDays(localDay(), -9));
    const screen = await renderScreens({ index: () => <ExamTimeline spaceId={space} /> }, data);
    expect(await screen.findByText("NEXT UP")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("days to go")).toBeTruthy();
    expect(screen.getByText("Today")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Quiz" })).toBeTruthy();
    expect(screen.getByText("Completed")).toBeTruthy();
  });
});

describe("the Decks grid", () => {
  it("splits decks into ready to study and all caught up, with a play button for cards waiting", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const sorting = await createDeck(data.db, space, "Sorting");
    await createCard(data.db, sorting, "Quick sort", "n log n");
    await createDeck(data.db, space, "Empty");
    const screen = await renderScreens({ index: () => <DeckGrid spaceId={space} /> }, data);
    expect(await screen.findByText("Ready to study")).toBeTruthy();
    expect(screen.getByText("All caught up")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Study Sorting, 1 card" }).length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText("1 new")).toBeTruthy();
  });
});
