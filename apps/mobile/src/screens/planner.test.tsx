import {
  createCourse,
  createExam,
  createOneOffSession,
  createSemester,
  createSpace,
  createStudyBlock,
  courseSemester,
  getSemester,
  getSession,
  listStudyBlocks,
  setCourseSemester,
  updateExam,
} from "@nookly/shared/data";
import { router } from "expo-router";
import { act, fireEvent, waitFor } from "expo-router/testing-library";
import { Text } from "react-native";
import { renderScreens, testData } from "../test/render.tsx";
import { EntityScreen } from "./EntityScreen.tsx";
import {
  GradesScreen,
  NewSemesterScreen,
  NewSessionScreen,
  SemesterRows,
} from "./PlannerScreens.tsx";

async function seeded() {
  const data = testData();
  const space = await createSpace(data.db, "Uni", "#3b82f6");
  const course = await createCourse(data.db, space, "Algorithms");
  return { data, space, course };
}

describe("a session", () => {
  it("is moved and given a place for this one session, and cancelled and brought back", async () => {
    const { data, space, course } = await seeded();
    const id = await createOneOffSession(data.db, space, {
      title: "Lecture 1",
      courseId: course,
      date: "2026-10-21",
      startTime: "10:00",
      endTime: "11:30",
    });
    const screen = await renderScreens(
      { "entity/[id]": () => <EntityScreen id={id} /> },
      data,
      `/entity/${id}`,
    );
    expect(await screen.findByRole("button", { name: "Algorithms, Course" })).toBeTruthy();
    const where = screen.getByLabelText("Where");
    await fireEvent.changeText(where, "Room 7");
    await fireEvent(where, "endEditing");
    await waitFor(async () => expect((await getSession(data.db, id))?.location).toBe("Room 7"));
    await fireEvent.press(screen.getByRole("button", { name: "Cancel This Session" }));
    await waitFor(async () => expect((await getSession(data.db, id))?.cancelled).toBe(true));
    expect(await screen.findByText("Cancelled")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Bring Back" }));
    await waitFor(async () => expect((await getSession(data.db, id))?.cancelled).toBe(false));
  });

  it("is made one off, for a course picked, and says what is missing", async () => {
    const { data, space, course } = await seeded();
    const screen = await renderScreens(
      {
        index: () => <Text>Home</Text>,
        "entity/[id]": () => <Text>Opened</Text>,
        "new/session": () => <NewSessionScreen spaceId={space} />,
      },
      data,
    );
    await act(() => router.push("/new/session"));
    await fireEvent.press(await screen.findByRole("button", { name: "New Session" }));
    expect(await screen.findByText("Pick a course for the session.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("radio", { name: "Algorithms" }));
    await fireEvent.changeText(screen.getByLabelText("Title"), "Tutorial");
    await fireEvent.press(screen.getByRole("button", { name: "Couldn't create" }));
    await waitFor(async () => {
      const rows = await data.driver.query(
        "SELECT e.title, r.to_entity_id AS course FROM sessions s JOIN entities e ON e.id = s.entity_id JOIN relationships r ON r.from_entity_id = e.id",
        [],
      );
      expect(rows).toEqual([{ title: "Tutorial", course }]);
    });
  });
});

describe("an exam's study blocks", () => {
  it("lists the blocks of the exam, newest first by day", async () => {
    const { data, space, course } = await seeded();
    const exam = await createExam(data.db, space, "Final", course);
    await createStudyBlock(data.db, space, {
      title: "Revise graphs",
      examId: exam,
      date: "2026-12-05",
      startTime: "14:00",
      endTime: "16:00",
    });
    const screen = await renderScreens(
      { "entity/[id]": () => <EntityScreen id={exam} /> },
      data,
      `/entity/${exam}`,
    );
    expect(
      await screen.findByRole("button", { name: /^Revise graphs, .*14:00 to 16:00$/ }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "New Study Block" })).toBeTruthy();
    expect(await listStudyBlocks(data.db, { examId: exam })).toHaveLength(1);
  });
});

describe("semesters", () => {
  it("lists them with the current one marked, and a course takes one", async () => {
    const { data, space, course } = await seeded();
    const ws = await createSemester(data.db, space, {
      title: "WS 25/26",
      termType: "winter",
      year: 2025,
      startDate: "2025-10-15",
      endDate: "2026-02-15",
    });
    await data.driver.query("UPDATE semesters SET is_current = 1 WHERE entity_id = ?", [ws]);
    const rows = await renderScreens({ index: () => <SemesterRows spaceId={space} /> }, data);
    expect(await rows.findByText("Current")).toBeTruthy();
    const screen = await renderScreens(
      { "entity/[id]": () => <EntityScreen id={course} /> },
      data,
      `/entity/${course}`,
    );
    await fireEvent.press(await screen.findByRole("radio", { name: "WS 25/26" }));
    await waitFor(async () => expect(await courseSemester(data.db, course)).toBe(ws));
  });

  it("makes one the current semester and shows the courses in it", async () => {
    const { data, space, course } = await seeded();
    const ws = await createSemester(data.db, space, { title: "WS 25/26" });
    await setCourseSemester(data.db, course, ws);
    const screen = await renderScreens(
      { "entity/[id]": () => <EntityScreen id={ws} /> },
      data,
      `/entity/${ws}`,
    );
    expect(
      await screen.findByRole("button", {
        name:
          "Algorithms, " +
          (
            await data.driver.query(
              "SELECT key_prefix || '-' || key_number AS k FROM entities WHERE id = ?",
              [course],
            )
          )[0].k,
      }),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Make Current" }));
    await waitFor(async () => expect((await getSemester(data.db, ws))?.isCurrent).toBe(true));
  });

  it("is made from a term system, year and the dates typical of a region", async () => {
    const { data, space } = await seeded();
    const screen = await renderScreens(
      {
        index: () => <Text>Home</Text>,
        "entity/[id]": () => <Text>Opened</Text>,
        "new/semester": () => <NewSemesterScreen spaceId={space} />,
      },
      data,
    );
    await act(() => router.push("/new/semester"));
    await fireEvent.press(await screen.findByRole("radio", { name: "Germany" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Summer" }));
    await fireEvent.press(screen.getByRole("radio", { name: "2027" }));
    await fireEvent.press(screen.getByRole("button", { name: "New Semester" }));
    await waitFor(async () => {
      const [row] = await data.driver.query(
        "SELECT e.title, s.term_type, s.year, s.start_date, s.end_date FROM semesters s JOIN entities e ON e.id = s.entity_id",
        [],
      );
      expect(row).toEqual({
        title: "Summer 2027",
        term_type: "summer",
        year: 2027,
        start_date: "2027-04-15",
        end_date: "2027-07-15",
      });
    });
  });
});

describe("the grade report", () => {
  it("shows the average, each semester and course, and the work behind a grade", async () => {
    const { data, space, course } = await seeded();
    const ws = await createSemester(data.db, space, { title: "WS 25/26" });
    await setCourseSemester(data.db, course, ws);
    const exam = await createExam(data.db, space, "Final", course, "2026-02-01");
    await updateExam(data.db, exam, { grade: 1.7, weight: 0.6 });
    const screen = await renderScreens({ index: () => <GradesScreen spaceId={space} /> }, data);
    expect(await screen.findByText("Cumulative average")).toBeTruthy();
    expect(screen.getAllByText("1.7").length).toBeGreaterThan(0);
    expect(screen.getByRole("header", { name: "WS 25/26" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Algorithms, 100% decided$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Final, Exam · .*counts 100%$/ })).toBeTruthy();
  });

  it("explains an empty report", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const screen = await renderScreens({ index: () => <GradesScreen spaceId={space} /> }, data);
    expect(await screen.findByText(/No courses to report on yet/)).toBeTruthy();
  });
});
