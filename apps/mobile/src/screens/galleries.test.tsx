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
import { fireEvent, waitFor } from "expo-router/testing-library";
import { StyleSheet, Text } from "react-native";
import { openRow } from "../test/sheet.ts";
import { renderScreens, testData } from "../test/render.tsx";
import { addDays, localDay } from "./dates.ts";
import { CourseGallery, DeckGrid, ExamTimeline } from "./StudyGalleries.tsx";
import { ModuleScreen } from "./ModuleScreen.tsx";
import { semantic } from "../ui/tokens.ts";

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

describe("the cards on a gallery page", () => {
  // On the Courses page a card was drawn in the page's own tone, so it did not read as a
  // card at all in light mode. A page of cards puts them one step off the page, like Home.
  it("are a step off the page, not its own colour", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    await createCourse(data.db, space, "Algorithms");
    const screen = await renderScreens(
      { "module/[spaceId]/[module]": () => <ModuleScreen spaceId={space} module="courses" /> },
      data,
      `/module/${space}/courses`,
    );
    const card = await screen.findByRole("button", { name: "Algorithms" });
    const { backgroundColor, borderRadius } = StyleSheet.flatten(card.props.style);
    expect(backgroundColor).toEqual(semantic("pageCard", "light"));
    expect(borderRadius).toBeGreaterThan(0);
  });
});

describe("the Courses gallery's filters (D73)", () => {
  it("narrows to a semester, and offers the fields every item has", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const winter = await createSemester(data.db, space, { title: "Winter 26" });
    const algo = await createCourse(data.db, space, "Algorithms");
    await createCourse(data.db, space, "Loose course");
    await setCourseSemester(data.db, algo, winter);
    const screen = await renderScreens({ index: () => <CourseGallery spaceId={space} /> }, data);
    expect(await screen.findByRole("header", { name: "Courses" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Filter" }));
    for (const name of ["Semester", "Pinned", "Created", "Updated"]) {
      expect(await screen.findByRole("button", { name: new RegExp(`^${name}, `) })).toBeTruthy();
    }
    await openRow(screen, "Semester");
    await fireEvent.press(await screen.findByRole("checkbox", { name: "No semester" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Algorithms" })).toBeNull());
    expect(screen.getByRole("button", { name: "Loose course" })).toBeTruthy();
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

  // The desktop's Course filter (D65); a narrower date column, and Today across the width.
  it("narrows to a course, with Today across the whole width", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const algo = await createCourse(data.db, space, "Algorithms");
    const stats = await createCourse(data.db, space, "Statistics");
    await createExam(data.db, space, "Algo final", algo, addDays(localDay(), 12));
    await createExam(data.db, space, "Stats final", stats, addDays(localDay(), 20));
    const screen = await renderScreens({ index: () => <ExamTimeline spaceId={space} /> }, data);
    expect(await screen.findByRole("button", { name: "Stats final" })).toBeTruthy();
    // The marker reads as a heading; nothing holds a date column's room before it.
    expect(screen.getByRole("header", { name: "Today" })).toBeTruthy();
    expect(screen.getAllByTestId("exam-day")[0].props.style).toMatchObject({ width: 48 });
    await fireEvent.press(screen.getByRole("button", { name: "Filter" }));
    await openRow(screen, "Course");
    await fireEvent.press(await screen.findByRole("checkbox", { name: "Algorithms" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Stats final" })).toBeNull());
    expect(screen.getByRole("button", { name: "Algo final" })).toBeTruthy();
  });

  // The desktop's Date and Status filters, and the fields every item has (D73).
  it("narrows to past exams, and offers status and the fields every item has", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const course = await createCourse(data.db, space, "Algorithms");
    await createExam(data.db, space, "Midterm", course, addDays(localDay(), 12));
    await createExam(data.db, space, "Quiz", course, addDays(localDay(), -9));
    const screen = await renderScreens({ index: () => <ExamTimeline spaceId={space} /> }, data);
    expect(await screen.findByRole("button", { name: "Quiz" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Filter" }));
    for (const name of ["Course", "Date", "Status", "Pinned", "Created", "Updated"]) {
      expect(await screen.findByRole("button", { name: new RegExp(`^${name}, `) })).toBeTruthy();
    }
    await openRow(screen, "Date");
    await fireEvent.press(await screen.findByRole("checkbox", { name: "Past" }));
    await waitFor(() => expect(screen.queryByText("Midterm")).toBeNull());
    expect(screen.getByRole("button", { name: "Quiz" })).toBeTruthy();
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
    // A title with the count, as every list page has, and Import beside it.
    expect(screen.getByRole("header", { name: "Decks" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Import Deck File" })).toBeTruthy();
  });

  // The desktop's Exam and Cards to study filters, and the fields every item has (D73).
  it("narrows to decks with cards waiting", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const sorting = await createDeck(data.db, space, "Sorting");
    await createCard(data.db, sorting, "Quick sort", "n log n");
    await createDeck(data.db, space, "Empty");
    const screen = await renderScreens({ index: () => <DeckGrid spaceId={space} /> }, data);
    expect(await screen.findByText("All caught up")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Filter" }));
    for (const name of ["Exam", "Cards to study", "Pinned", "Created", "Updated"]) {
      expect(await screen.findByRole("button", { name: new RegExp(`^${name}, `) })).toBeTruthy();
    }
    await openRow(screen, "Cards to study");
    await fireEvent.press(await screen.findByRole("checkbox", { name: "Ready to study" }));
    await waitFor(() => expect(screen.queryByRole("header", { name: "All caught up" })).toBeNull());
    expect(screen.getByRole("header", { name: "Ready to study" })).toBeTruthy();
  });

  // The empty page was one grey line under a bare text button.
  it("says what to do when there are no decks, with New Deck", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const screen = await renderScreens(
      {
        index: () => <DeckGrid spaceId={space} />,
        "new/deck": () => <Text>New deck sheet</Text>,
      },
      data,
    );
    expect(await screen.findByRole("summary", { name: /^No Decks Yet/ })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "New Deck" }));
    expect(await screen.findByText("New deck sheet")).toBeTruthy();
  });
});
