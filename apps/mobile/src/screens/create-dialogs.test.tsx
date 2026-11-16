import { createSpace } from "@nookly/shared/data";
import { StyleSheet } from "react-native";
import { renderScreens, testData } from "../test/render.tsx";
import Assignment from "../app/new/assignment.tsx";
import Bookmark from "../app/new/bookmark.tsx";
import Course from "../app/new/course.tsx";
import Deck from "../app/new/deck.tsx";
import Entry from "../app/new/entry.tsx";
import Exam from "../app/new/exam.tsx";
import Page from "../app/new/page.tsx";
import Recipe from "../app/new/recipe.tsx";
import Semester from "../app/new/semester.tsx";
import Session from "../app/new/session.tsx";
import Share from "../app/new/share.tsx";
import Space from "../app/new/space.tsx";
import Task from "../app/new/task.tsx";

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
  // Not a create form, but the desktop's Share dialog is medium as well (8.9).
  share: Share,
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
