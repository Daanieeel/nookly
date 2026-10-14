import {
  createCalendarEntry,
  createCourse,
  createExam,
  createOneOffSession,
  createSpace,
  createStudyBlock,
  updateExam,
} from "@nookly/shared/data";
import { fireEvent } from "expo-router/testing-library";
import { renderScreens, testData } from "../test/render.tsx";
import { addDays, localDay } from "./dates.ts";
import { CalendarScreen } from "./CalendarScreen.tsx";

/// Everything the calendar draws, over the next days from today.
async function planned() {
  const data = testData();
  const space = await createSpace(data.db, "Uni", "#3b82f6");
  const course = await createCourse(data.db, space, "Algorithms");
  const today = localDay();
  await createCalendarEntry(data.db, space, {
    title: "Dentist",
    date: today,
    startTime: "09:00",
    endTime: "10:00",
    allDay: false,
    location: "Main Street",
  });
  await createOneOffSession(data.db, space, {
    title: "Lecture 1",
    courseId: course,
    date: today,
    startTime: "11:00",
    endTime: "12:30",
    location: "Room 5",
  });
  const exam = await createExam(data.db, space, "Final", course);
  await updateExam(data.db, exam, { examDate: addDays(today, 1), examTime: "09:00" });
  await createStudyBlock(data.db, space, {
    title: "Revise graphs",
    examId: exam,
    date: today,
    startTime: "14:00",
    endTime: "16:00",
  });
  return { data, today };
}

describe("the calendar", () => {
  it("shows an agenda of sessions, entries, exams and study blocks with what each is", async () => {
    const { data } = await planned();
    const screen = await renderScreens({ index: () => <CalendarScreen /> }, data);
    expect(
      await screen.findByRole("button", { name: "Dentist, 09:00 to 10:00, Main Street" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Lecture 1, Session, 11:00 to 12:30, Room 5" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Revise graphs, Study block, 14:00 to 16:00" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Final, Exam, 09:00" })).toBeTruthy();
  });

  it("shows one day, and moves to the next with the exam on it", async () => {
    const { data } = await planned();
    const screen = await renderScreens({ index: () => <CalendarScreen /> }, data);
    await fireEvent.press(await screen.findByRole("radio", { name: "Day" }));
    expect(await screen.findByRole("button", { name: /^Dentist/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Final/ })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("button", { name: /^Final/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Dentist/ })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Today" }));
    expect(await screen.findByRole("button", { name: /^Dentist/ })).toBeTruthy();
  });

  it("shows a week with every day of it", async () => {
    const { data } = await planned();
    const screen = await renderScreens({ index: () => <CalendarScreen /> }, data);
    await fireEvent.press(await screen.findByRole("radio", { name: "Week" }));
    expect(await screen.findByRole("button", { name: /^Dentist/ })).toBeTruthy();
    expect(screen.getByRole("header", { name: / to / })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Lecture 1/ })).toBeTruthy();
  });

  it("shows a month as a grid, marks the busy days and lists the day picked", async () => {
    const { data, today } = await planned();
    const screen = await renderScreens({ index: () => <CalendarScreen /> }, data);
    await fireEvent.press(await screen.findByRole("radio", { name: "Month" }));
    const cell = await screen.findByRole("button", { name: "Today, 3 items" });
    expect(cell).toBeTruthy();
    expect(await screen.findByRole("button", { name: /^Dentist/ })).toBeTruthy();
    const tomorrow = screen.getByRole("button", { name: /^Tomorrow, 1 item$/ });
    await fireEvent.press(tomorrow);
    expect(await screen.findByRole("button", { name: /^Final/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Dentist/ })).toBeNull();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
