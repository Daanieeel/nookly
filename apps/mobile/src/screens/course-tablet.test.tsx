import {
  createCalendarEntry,
  createCourse,
  createOneOffSession,
  createSpace,
} from "@nookly/shared/data";
import { StyleSheet } from "react-native";
import { within } from "expo-router/testing-library";
import { renderScreens, testData } from "../test/render.tsx";
import { localDay } from "./dates.ts";
import { EntityScreen } from "./EntityScreen.tsx";

// A course's page on a tablet has the desktop's week cutout (6.6): this week's hours, the
// course's own sessions drawn plainly and everything else faded behind them.
describe("a course on a tablet", () => {
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
    const week = within(await screen.findByTestId("course-week"));
    const opacity = async (name: RegExp) =>
      StyleSheet.flatten((await week.findByRole("button", { name })).props.style).opacity ?? 1;
    expect(await opacity(/^Lecture/)).toBe(1);
    expect(await opacity(/^Dentist/)).toBeLessThan(1);
  });

  it("keeps the phone's list of sessions on a phone", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const course = await createCourse(data.db, space, "Algebra");
    const screen = await renderScreens({ index: () => <EntityScreen id={course} /> }, data, "/");
    await screen.findByLabelText("Sessions");
    expect(screen.queryByTestId("course-week")).toBeNull();
  });
});
