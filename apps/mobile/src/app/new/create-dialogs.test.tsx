import { createSpace } from "@nookly/shared/data";
import { StyleSheet } from "react-native";
import { renderScreens, testData } from "../../test/render.tsx";
import Assignment from "./assignment.tsx";
import Bookmark from "./bookmark.tsx";
import Course from "./course.tsx";
import Deck from "./deck.tsx";
import Entry from "./entry.tsx";
import Exam from "./exam.tsx";
import Page from "./page.tsx";
import Recipe from "./recipe.tsx";
import Semester from "./semester.tsx";
import Session from "./session.tsx";
import Space from "./space.tsx";
import Task from "./task.tsx";

const FORMS = {
  assignment: Assignment,
  bookmark: Bookmark,
  course: Course,
  deck: Deck,
  entry: Entry,
  exam: Exam,
  page: Page,
  recipe: Recipe,
  semester: Semester,
  session: Session,
  space: Space,
  task: Task,
};

// Every create form is the desktop's medium dialog over the page that opened it (7.1).
describe("a tablet's create forms", () => {
  it.each(Object.entries(FORMS))("shows New %s as a medium dialog", async (name, Form) => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const screen = await renderScreens(
      { index: () => null, [`new/${name}`]: Form },
      data,
      `/new/${name}?spaceId=${space}`,
      {
        width: 1376,
        height: 1032,
      },
    );
    const dialog = await screen.findByTestId("sheet-dialog");
    expect(StyleSheet.flatten(dialog.props.style).width).toBe(560);
  });
});
