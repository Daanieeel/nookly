import { StyleSheet } from "react-native";
import NewSemesterRoute from "../app/new/semester.tsx";
import {
  createCourse,
  createEntityStatements,
  createExam,
  createOneOffSession,
  createSemester,
  sessionPage,
  createSpace,
  courseSemester,
  getSemester,
  getSession,
  setCourseSemester,
} from "@nookly/shared/data";
import { router } from "expo-router";
import { act, fireEvent, waitFor } from "expo-router/testing-library";
import { Text } from "react-native";
import { barLabels, renderScreens, testData } from "../test/render.tsx";
import { ModuleScreen } from "./ModuleScreen.tsx";
import { choose, openRow, pickDay, pickDayInSheet } from "../test/sheet.ts";
import { EntityScreen } from "./EntityScreen.tsx";
import { NewSemesterScreen, NewSessionScreen, primarySessionPage } from "./PlannerScreens.tsx";
import { dayLabel } from "./dates.ts";
import { SemesterList, semesterSpan } from "./SemesterList.tsx";

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

  it("is made one off, for a course picked, which it needs first", async () => {
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
    // D65: without its course there is nothing to send.
    const send = await screen.findByRole("button", { name: "Create Session" });
    expect(send.props.accessibilityState).toMatchObject({ disabled: true });
    await choose(screen, "Course", "Algorithms");
    await fireEvent.changeText(screen.getByLabelText("Session title"), "Tutorial");
    await fireEvent.press(screen.getByRole("button", { name: "Create Session" }));
    await waitFor(async () => {
      const rows = await data.driver.query(
        "SELECT e.title, r.to_entity_id AS course FROM sessions s JOIN entities e ON e.id = s.entity_id JOIN relationships r ON r.from_entity_id = e.id",
        [],
      );
      expect(rows).toEqual([{ title: "Tutorial", course }]);
    });
  });
});

describe("a weekly session", () => {
  it("is made as a series for the weeks picked", async () => {
    const { data, space, course } = await seeded();
    const screen = await renderScreens(
      {
        index: () => <NewSessionScreen spaceId={space} courseId={course} date="2026-11-18" />,
        "entity/[id]": () => <Text>Opened</Text>,
      },
      data,
    );
    await openRow(screen, "Repeat");
    await fireEvent.press(await screen.findByRole("radio", { name: "Weekly" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Until a day" }));
    await pickDayInSheet(screen, "2026-12-02");
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    await fireEvent.press(screen.getByRole("button", { name: "Create Session" }));
    await waitFor(async () => {
      const made = await data.driver.query(
        "SELECT date, template_id FROM sessions ORDER BY date",
        [],
      );
      expect(made.map((s) => s.date)).toEqual(["2026-11-18", "2026-11-25", "2026-12-02"]);
      expect(new Set(made.map((s) => s.template_id)).size).toBe(1);
    });
  });
});

describe("an exam's page", () => {
  // Study blocks are gone from Nookly; an old one stays in the database, unseen.
  it("has no study blocks", async () => {
    const { data, space, course } = await seeded();
    const exam = await createExam(data.db, space, "Final", course);
    const { id, statements } = createEntityStatements(data.db, space, "study_block", "Revise");
    await data.db.driver.batch([
      ...statements,
      {
        sql: "INSERT INTO study_blocks (entity_id, date, start_time, end_time) VALUES (?, ?, ?, ?)",
        params: [id, "2026-12-05", "14:00", "16:00"],
      },
    ]);
    const screen = await renderScreens(
      { "entity/[id]": () => <EntityScreen id={exam} /> },
      data,
      `/entity/${exam}`,
    );
    expect((await screen.findAllByRole("button", { name: /^Status/ })).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/Study block/i)).toEqual([]);
    expect(screen.queryByRole("button", { name: "New Study Block" })).toBeNull();
  });
});

describe("a session's pages", () => {
  it("makes the Jot and the Note for one session and then opens them", async () => {
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
    await fireEvent.press(
      await screen.findByRole("button", { name: "Create Jot for This Session" }),
    );
    await waitFor(async () => expect(await sessionPage(data.db, id, "jot")).not.toBeNull());
    expect(
      await screen.findByRole("button", { name: /^Algorithms, 2026-10-21, JOT-/ }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create Note for This Session" })).toBeTruthy();
  });

  // As on the desktop: the next page to write is the blue one.
  it("makes the Jot the main button first, then the Note, then neither", () => {
    expect(primarySessionPage(false, false)).toBe("jot");
    expect(primarySessionPage(true, false)).toBe("note");
    expect(primarySessionPage(true, true)).toBeNull();
    expect(primarySessionPage(false, true)).toBe("jot");
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
    await setCourseSemester(data.db, course, ws);
    const rows = await renderScreens({ index: () => <SemesterList spaceId={space} /> }, data);
    expect(await rows.findByText("Current")).toBeTruthy();
    // The current semester is Nookly's blue, not green (the user's notes).
    expect(rows.UNSAFE_queryAllByProps({ tint: "green" })).toHaveLength(0);
    expect(rows.UNSAFE_getAllByProps({ label: "Current", variant: "primary" }).length).toBe(1);
    expect(await rows.findByText("1 course")).toBeTruthy();
    expect(
      rows.getByText(semesterSpan({ startDate: "2025-10-15", endDate: "2026-02-15" }) ?? ""),
    ).toBeTruthy();
    // The Current badge sits on the card's bottom edge, centred (the user's notes).
    const badge = rows.getByTestId("current-badge");
    expect(StyleSheet.flatten(badge.props.style)).toMatchObject({
      position: "absolute",
      alignSelf: "center",
    });
    // No chevron and no expanding: the card is the way in.
    expect(
      rows.getByRole("button", { name: "WS 25/26" }).props.accessibilityState?.expanded,
    ).toBeUndefined();
    const screen = await renderScreens(
      { "entity/[id]": () => <EntityScreen id={course} /> },
      data,
      `/entity/${course}`,
    );
    await openRow(screen, "Semester");
    // Each semester as the desktop's picker shows it: its dates and whether it is the current one.
    expect(
      await screen.findByText(`${dayLabel("2025-10-15")} to ${dayLabel("2026-02-15")}`),
    ).toBeTruthy();
    expect(screen.getAllByText("Current").length).toBeGreaterThan(0);
    await fireEvent.press(await screen.findByRole("radio", { name: "WS 25/26" }));
    await waitFor(async () => expect(await courseSemester(data.db, course)).toBe(ws));
  });

  // "Set dates" did nothing when tapped; each row also opens its semester directly, and
  // the setup sits in the bar beside +, not as a big button on the page. The row was
  // crammed, so Set Dates moved into its menu.
  it("sets its dates from the row's menu, opens it, and offers the setup in the bar", async () => {
    const { data, space } = await seeded();
    const ws = await createSemester(data.db, space, { title: "WS 26/27" });
    const screen = await renderScreens(
      {
        "module/[spaceId]/[module]": () => <ModuleScreen spaceId={space} module="semesters" />,
        "entity/[id]": () => <Text>Opened</Text>,
        "new/semester-setup": () => <Text>Setup</Text>,
      },
      data,
      `/module/${space}/semesters`,
    );
    expect(await screen.findByRole("button", { name: "WS 26/27" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Set Up Semesters" })).toBeNull();
    expect(barLabels(screen)).toEqual(
      expect.arrayContaining(["Set Up Semesters", "New in Semesters"]),
    );
    expect(screen.queryByRole("button", { name: "Set dates of WS 26/27" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Options for WS 26/27" }));
    await fireEvent.press(await screen.findByRole("menuitem", { name: "Set Dates" }));
    await pickDay(screen, "Starts", "2026-10-15");
    // The first calendar goes away before the second opens.
    await waitFor(() =>
      expect(screen.queryAllByRole("button", { name: "Next Month" })).toEqual([]),
    );
    await pickDay(screen, "Ends", "2027-02-15");
    await waitFor(async () =>
      expect(await getSemester(data.db, ws)).toMatchObject({
        startDate: "2026-10-15",
        endDate: "2027-02-15",
      }),
    );
    // Short dates beside its courses, whole, never cut off (it was squeezed).
    expect(
      await screen.findByText(
        semesterSpan({ startDate: "2026-10-15", endDate: "2027-02-15" }) ?? "",
      ),
    ).toBeTruthy();
    expect(screen.getByText("0 courses")).toBeTruthy();
    expect(semesterSpan({ startDate: "2026-10-15", endDate: "2027-02-15" }, 2026)).toBe(
      "Oct 15 to Feb 15, 2027",
    );
    // A tap on the semester opens it; no separate Open button.
    expect(screen.queryByRole("button", { name: "Open WS 26/27" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "WS 26/27" }));
    expect(await screen.findByText("Opened")).toBeTruthy();
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
    // The semester's page is its notes already: no button opens them again.
    expect(screen.queryByRole("button", { name: "Open Notes" })).toBeNull();
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
    await choose(screen, "Typical dates for", "Germany");
    await choose(screen, "Term", "Summer");
    await choose(screen, "Year", "2027");
    await fireEvent.press(screen.getByRole("button", { name: "Create Semester" }));
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

// The + on Semesters opened a sheet over the whole screen for three choices and a button.
describe("the New Semester sheet", () => {
  it("takes only the height it needs", async () => {
    const { data, space } = await seeded();
    const screen = await renderScreens(
      { index: () => <Text>Home</Text>, "new/semester": NewSemesterRoute },
      data,
    );
    await act(() => router.push(`/new/semester?spaceId=${space}`));
    const panel = await screen.findByTestId("sheet-panel");
    expect(StyleSheet.flatten(panel.props.style).height).toBeUndefined();
  });
});
