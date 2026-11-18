import { fireEvent, within } from "expo-router/testing-library";
import { renderScreens, testData } from "../test/render.tsx";
import { type MoodleAnswers, connected } from "../test/fake-moodle.tsx";
import { MoodleCourseScreen } from "./MoodleCourse.tsx";

const TWO_WEEKS: MoodleAnswers = {
  core_enrol_get_users_courses: [{ id: 1, shortname: "ALG", fullname: "Algorithms" }],
  core_course_get_contents: [
    {
      id: 10,
      name: "Week 1",
      summary: "",
      modules: [{ id: 100, name: "Quiz 1", modname: "quiz" }],
    },
    {
      id: 11,
      name: "Week 2",
      summary: "",
      modules: [{ id: 101, name: "Quiz 2", modname: "quiz" }],
    },
  ],
};

// A tablet's Moodle course is the desktop's `CoursePage` (9.1): its sections listed beside
// the one shown in a wide page, a picker over it in a narrow one.
describe("a Moodle course on a tablet", () => {
  it("lists its sections beside the one shown", async () => {
    const moodle = connected(TWO_WEEKS);
    const screen = await renderScreens(
      { index: moodle.wrap(<MoodleCourseScreen courseId={1} spaceId="s" />) },
      testData(),
      "/",
      { width: 1194 },
    );
    const list = within(await screen.findByLabelText("Sections"));
    expect(screen.getByText("Quiz 1")).toBeTruthy();
    expect(screen.queryByText("Quiz 2")).toBeNull();
    await fireEvent.press(list.getByRole("tab", { name: "Week 2" }));
    expect(await screen.findByText("Quiz 2")).toBeTruthy();
    expect(screen.queryByText("Quiz 1")).toBeNull();
  });

  it("picks a section from a field in a narrow page", async () => {
    const moodle = connected(TWO_WEEKS);
    const screen = await renderScreens(
      { index: moodle.wrap(<MoodleCourseScreen courseId={1} spaceId="s" />) },
      testData(),
      "/",
      { width: 744, height: 1133 },
    );
    expect(await screen.findByText("Quiz 1")).toBeTruthy();
    expect(screen.queryByLabelText("Sections")).toBeNull();
    expect(screen.getByLabelText(/^Section/)).toBeTruthy();
  });
});
