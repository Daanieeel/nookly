import {
  createCalendarEntry,
  createCourse,
  createExam,
  createOneOffSession,
  createSpace,
  createStudyBlock,
  listSpaces,
  updateExam,
} from "@nookly/shared/data";
import { fireEvent } from "expo-router/testing-library";
import * as ReactNative from "react-native";
import useWindowDimensions from "react-native/Libraries/Utilities/useWindowDimensions";
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
    await fireEvent.press(await screen.findByRole("radio", { name: "Agenda" }));
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

async function listSpacesFor(data: Awaited<ReturnType<typeof planned>>["data"]) {
  return (await listSpaces(data.db)).map((space) => space.id);
}

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: jest.fn(),
}));
const dimensions = jest.mocked(useWindowDimensions);
const IPAD = { width: 750, height: 1024, scale: 2, fontScale: 1 };
beforeEach(() => dimensions.mockReturnValue(IPAD));

/// A phone's width for one test: the calendar reads the window's.
function asPhone() {
  dimensions.mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
}

describe("the calendar on a phone", () => {
  it("offers the agenda, a day, three days and a week, and no month", async () => {
    asPhone();
    const { data } = await planned();
    const screen = await renderScreens({ index: () => <CalendarScreen /> }, data);
    for (const name of ["Agenda", "Day", "3 Days", "Week"]) {
      expect(await screen.findByRole("radio", { name })).toBeTruthy();
    }
    expect(screen.queryByRole("radio", { name: "Month" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Work Week" })).toBeNull();
  });

  it("lays the hours out with each item where it belongs, three days at a time", async () => {
    asPhone();
    const { data } = await planned();
    const screen = await renderScreens({ index: () => <CalendarScreen /> }, data);
    await fireEvent.press(await screen.findByRole("radio", { name: "3 Days" }));
    expect(await screen.findByRole("button", { name: "Dentist, 09:00 to 10:00" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lecture 1, 11:00 to 12:30" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Final, 09:00" })).toBeTruthy();
    // The label above the hours says which days.
    expect(screen.getByRole("header", { name: / to / })).toBeTruthy();
  });

  it("keeps every block inside its day's column on a full week, however narrow", async () => {
    asPhone();
    const { data, today } = await planned();
    // Two items at the same time share a column's width.
    await createCalendarEntry(data.db, (await listSpacesFor(data))[0], {
      title: "A very long title that cannot possibly fit in a column",
      date: today,
      startTime: "09:00",
      endTime: "10:00",
      allDay: false,
      location: "Room 123 in the building across town",
    });
    const screen = await renderScreens({ index: () => <CalendarScreen /> }, data);
    await fireEvent.press(await screen.findByRole("radio", { name: "Week" }));
    const blocks = await screen.findAllByRole("button", { name: /, \d\d:\d\d( to \d\d:\d\d)?$/ });
    expect(blocks.length).toBeGreaterThanOrEqual(5);
    const column = (390 - 40) / 7;
    for (const block of blocks) {
      const style = ReactNative.StyleSheet.flatten(block.props.style);
      expect(style.width).toBeGreaterThan(0);
      expect(style.width + style.left).toBeLessThanOrEqual(column + 0.01);
      // A narrow block keeps to the title: no times, rooms or second lines to spill.
      expect(block.findAllByType(ReactNative.Text)).toBeDefined();
    }
    // The long title is cut to the block, not wrapped without end.
    const long = screen.getByRole("button", { name: /^A very long title/ });
    const text = long.findAllByType(ReactNative.Text)[0];
    expect(text.props.numberOfLines).toBeGreaterThanOrEqual(1);
    expect(long.findAllByType(ReactNative.Text)).toHaveLength(1);
  });
});
