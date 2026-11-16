import {
  createCalendarEntry,
  createCourse,
  createOneOffSession,
  createSemester,
  createSpace,
  setCourseSemester,
} from "@nookly/shared/data";
import { StyleSheet } from "react-native";
import { within } from "expo-router/testing-library";
import { renderScreens, testData } from "../test/render.tsx";
import { localDay } from "./dates.ts";
import { EntityScreen } from "./EntityScreen.tsx";

// A course's and a session's page on a tablet have the desktop's week cutout (6.6, 6.10):
// the week's hours, their own sessions drawn plainly and everything else faded behind them.
describe("the week cutout on a tablet", () => {
  it("shows this week with its own sessions plain and the rest faded", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const course = await createCourse(data.db, space, "Algebra");
    const today = localDay();
    await createOneOffSession(data.db, space, {
      title: "Lecture",
      courseId: course,
      date: today,
      startTime: "10:00",
      endTime: "11:00",
    });
    await createCalendarEntry(data.db, space, {
      title: "Dentist",
      date: today,
      startTime: "14:00",
      endTime: "15:00",
      allDay: false,
      location: null,
    });
    const screen = await renderScreens({ index: () => <EntityScreen id={course} /> }, data, "/", {
      width: 1194,
    });
    const week = within(await screen.findByTestId("week-cutout"));
    const opacity = async (name: RegExp) =>
      StyleSheet.flatten((await week.findByRole("button", { name })).props.style).opacity ?? 1;
    expect(await opacity(/^Lecture/)).toBe(1);
    expect(await opacity(/^Dentist/)).toBeLessThan(1);
  });

  it("shows a session's week with the session plain and the rest faded", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const course = await createCourse(data.db, space, "Algebra");
    const at = { courseId: course, date: localDay(), endTime: "11:00" };
    const session = await createOneOffSession(data.db, space, {
      ...at,
      title: "Lecture",
      startTime: "10:00",
    });
    await createOneOffSession(data.db, space, { ...at, title: "Tutorial", startTime: "09:00" });
    const screen = await renderScreens({ index: () => <EntityScreen id={session} /> }, data, "/", {
      width: 1194,
    });
    const week = within(await screen.findByTestId("week-cutout"));
    const opacity = async (name: RegExp) =>
      StyleSheet.flatten((await week.findByRole("button", { name })).props.style).opacity ?? 1;
    expect(await opacity(/^Lecture/)).toBe(1);
    expect(await opacity(/^Tutorial/)).toBeLessThan(1);
  });

  it("keeps the phone's list of sessions on a phone", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const course = await createCourse(data.db, space, "Algebra");
    const screen = await renderScreens({ index: () => <EntityScreen id={course} /> }, data, "/");
    await screen.findByLabelText("Sessions");
    expect(screen.queryByTestId("week-cutout")).toBeNull();
  });
});

// A semester's courses on a tablet are the desktop's grid of course cards (6.10).
describe("a semester on a tablet", () => {
  it("lays its courses out as cards", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const course = await createCourse(data.db, space, "Algebra");
    const ws = await createSemester(data.db, space, { title: "WS 26/27" });
    await setCourseSemester(data.db, course, ws);
    const screen = await renderScreens({ index: () => <EntityScreen id={ws} /> }, data, "/", {
      width: 1194,
    });
    const card = await screen.findByTestId("semester-course");
    expect(within(card).getByText("Algebra")).toBeTruthy();
  });
});
