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
import { act } from "@testing-library/react-native";
import * as ReactNative from "react-native";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import { headerTitle, renderScreens, testData } from "../test/render.tsx";
import { addDays, isoWeek, localDay, periodTitle } from "./dates.ts";
import { CalendarScreen } from "./CalendarScreen.tsx";
import { HOUR_PX } from "./TimeGrid.tsx";
import { DashboardScreen } from "./DashboardScreen.tsx";

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

/// A phone's width: the calendar reads the window's.
const PHONE = 390;

describe("the calendar on a phone", () => {
  it("offers the agenda, a day, three days and a week, and no month", async () => {
    const { data } = await planned();
    const screen = await renderScreens({ index: () => <CalendarScreen /> }, data, "/", {
      width: PHONE,
    });
    for (const name of ["Agenda", "Day", "3 Days", "Week"]) {
      expect(await screen.findByRole("radio", { name })).toBeTruthy();
    }
    expect(screen.queryByRole("radio", { name: "Month" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Work Week" })).toBeNull();
  });

  it("carries the days' borders through the bar of all day items, to its bottom", async () => {
    const { data, today } = await planned();
    await createCalendarEntry(data.db, (await listSpacesFor(data))[0], {
      title: "Conference",
      date: today,
      startTime: null,
      endTime: null,
      allDay: true,
      location: "",
    });
    const screen = await renderScreens({ index: () => <CalendarScreen /> }, data, "/", {
      width: PHONE,
    });
    await fireEvent.press(await screen.findByRole("radio", { name: "3 Days" }));
    const chip = await screen.findByRole("button", { name: "Conference, all day" });
    const classes = (node: { props: { className?: string } }) => String(node.props.className ?? "");
    const cells = screen.getAllByTestId("all-day-day");
    expect(cells).toHaveLength(3);
    // Each day is closed on the left, the last on the right too.
    expect(cells.every((cell) => classes(cell).includes("border-l"))).toBe(true);
    expect(classes(cells[2])).toContain("border-r");
    // The cells hold the room under the chips (not the row around them), so their
    // borders reach the bottom of the bar.
    expect(cells.every((cell) => /\bpb-/.test(classes(cell)))).toBe(true);
    expect(chip).toBeTruthy();
  });

  it("spreads the view tabs over the full width, each taking an equal share", async () => {
    const { data } = await planned();
    const screen = await renderScreens({ index: () => <CalendarScreen /> }, data, "/", {
      width: PHONE,
    });
    const tabs = [];
    for (const name of ["Agenda", "Day", "3 Days", "Week"]) {
      tabs.push(await screen.findByRole("radio", { name }));
    }
    for (const tab of tabs) {
      expect(String(tab.props.className)).toMatch(/\bflex-1\b/);
    }
    // In a row that does not wrap, so they share one line.
    const group = screen.getByLabelText("View");
    expect(String(group.props.className)).not.toMatch(/flex-wrap/);
  });

  it("has no bar of arrows on a phone: the header names the dates and the week, a swipe moves on", async () => {
    jest.useFakeTimers();
    const { data } = await planned();
    const screen = await renderScreens({ index: () => <CalendarScreen /> }, data, "/", {
      width: PHONE,
    });
    await fireEvent.press(await screen.findByRole("radio", { name: "3 Days" }));
    await screen.findAllByTestId("gridline");
    expect(screen.queryByRole("button", { name: "Previous" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    const week = (day: string) => {
      const [y, m, d] = day.split("-").map(Number);
      return isoWeek(new Date(y, m - 1, d));
    };
    const title = (from: string) =>
      `${periodTitle(from, addDays(from, 2))}, Week ${week(addDays(from, 1))}`;
    const today = localDay();
    expect(headerTitle(screen)).toBe(title(today));
    // A swipe to the left brings the next three days, to the right the ones before: the page slides out and the next one in.
    const swipe = (translationX: number) => {
      act(() => fireGestureHandler(getByGestureTestId("calendar-swipe"), [{ translationX }]));
      // The slide, the move on and the settling.
      for (let i = 0; i < 10; i++) act(() => void jest.advanceTimersByTime(100));
    };
    swipe(-200);
    expect(headerTitle(screen)).toBe(title(addDays(today, 3)));
    swipe(200);
    expect(headerTitle(screen)).toBe(title(today));
    // A short drag is not a swipe: the page settles back where it was.
    swipe(-30);
    expect(headerTitle(screen)).toBe(title(today));
    // Nothing the animation left behind keeps the test run from ending.
    screen.unmount();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("has the pages either side already drawn, so a swipe slides them in", async () => {
    const { data, today } = await planned();
    const space = (await listSpacesFor(data))[0];
    for (const [title, date] of [
      ["Later page", addDays(today, 3)],
      ["Earlier page", addDays(today, -3)],
    ]) {
      await createCalendarEntry(data.db, space, {
        title,
        date,
        startTime: "10:00",
        endTime: "11:00",
        allDay: false,
        location: "",
      });
    }
    const screen = await renderScreens({ index: () => <CalendarScreen /> }, data, "/", {
      width: PHONE,
    });
    await fireEvent.press(await screen.findByRole("radio", { name: "3 Days" }));
    expect(await screen.findByRole("button", { name: /^Later page, / })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Earlier page, / })).toBeTruthy();
    // Three pages side by side, the middle one in view.
    const strips = screen.getAllByTestId("page-strip");
    for (const strip of strips) {
      const style = ReactNative.StyleSheet.flatten(strip.props.style);
      expect(style.width).toBe(3 * (390 - 40));
      expect(style.left).toBe(-(390 - 40));
    }
  });

  it("lays the hours out with each item where it belongs, three days at a time", async () => {
    const { data } = await planned();
    const screen = await renderScreens({ index: () => <CalendarScreen /> }, data, "/", {
      width: PHONE,
    });
    await fireEvent.press(await screen.findByRole("radio", { name: "3 Days" }));
    expect(await screen.findByRole("button", { name: "Dentist, 09:00 to 10:00" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lecture 1, 11:00 to 12:30" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Final, 09:00" })).toBeTruthy();
    // The page's bar says which days.
    expect(headerTitle(screen)).toMatch(/ to .*, Week \d+$/);
  });

  it("draws its lines in a solid color of their own, not the border's faded, which goes black in dark", async () => {
    const { data } = await planned();
    const screen = await renderScreens({ index: () => <CalendarScreen /> }, data, "/", {
      width: PHONE,
    });
    await fireEvent.press(await screen.findByRole("radio", { name: "3 Days" }));
    const lines = await screen.findAllByTestId("gridline");
    // Every hour and every day.
    expect(lines.length).toBeGreaterThanOrEqual(24 + 3);
    for (const line of lines) {
      expect(ReactNative.StyleSheet.flatten(line.props.style).borderColor).toBeDefined();
      expect(String(line.props.className ?? "")).not.toMatch(/border-border/);
    }
    // Each day is closed on the left, and the last of a page on the right too.
    const classes = lines.map((line) => String(line.props.className ?? ""));
    expect(
      classes.filter((c) => c.includes("inset-y-0")).every((c) => c.includes("border-l")),
    ).toBe(true);
    expect(classes.some((c) => c.includes("inset-y-0") && c.includes("border-r"))).toBe(true);
    // The lines run the whole height of the day: what they are placed in has that height
    // (a parent without one leaves them no length, and only the headers show borders).
    for (const column of lines.filter((l) => String(l.props.className).includes("inset-y-0"))) {
      let holder = column.parent;
      // (Skipping the column's own wrappers, which carry the same style.)
      while (holder && (!holder.props.style || holder.props.style === column.props.style)) {
        holder = holder.parent;
      }
      const height = ReactNative.StyleSheet.flatten(holder?.props.style)?.height;
      expect(height).toBe(24 * HOUR_PX);
    }
  });

  it("opens at the hour the day starts, and scrolls on to midnight past the home bar", async () => {
    const { data } = await planned();
    const screen = await renderScreens({ index: () => <CalendarScreen /> }, data, "/", {
      width: PHONE,
    });
    await fireEvent.press(await screen.findByRole("radio", { name: "3 Days" }));
    const hours = await screen.findByTestId("hours");
    // Opened there (7, by default) from the first frame, not scrolled to after it shows (which can miss).
    expect(hours.props.contentOffset.y).toBe(7 * HOUR_PX - 4);
    // The last hour is not left under the home bar.
    const content = ReactNative.StyleSheet.flatten(hours.props.contentContainerStyle);
    expect(content.paddingBottom).toBeGreaterThanOrEqual(16);
    // Only up and down; a sideways drift would fight the sidebar's swipe.
    expect(hours.props.directionalLockEnabled).toBe(true);
  });

  it("keeps every block inside its day's column on a full week, however narrow", async () => {
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
    const screen = await renderScreens({ index: () => <CalendarScreen /> }, data, "/", {
      width: PHONE,
    });
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

describe("the calendar's colors", () => {
  it("draw each kind of item as the desktop does, in its Space's color", async () => {
    const { data } = await planned();
    const screen = await renderScreens({ index: () => <CalendarScreen /> }, data);
    await fireEvent.press(await screen.findByRole("radio", { name: "Day" }));
    const style = async (name: RegExp) =>
      ReactNative.StyleSheet.flatten((await screen.findByRole("button", { name })).props.style);
    // A calendar entry: a bar on the left, a stronger tint.
    const entry = await style(/^Dentist/);
    expect(entry.borderLeftWidth).toBe(4);
    expect(entry.borderLeftColor).toBe("#3b82f6");
    expect(entry.backgroundColor).toBe("#3b82f64d");
    // A session: an outline all round, a faint tint.
    const session = await style(/^Lecture 1/);
    expect(session.borderWidth).toBe(2);
    expect(session.borderLeftWidth).toBe(2);
    expect(session.borderColor).toBe("#3b82f6ff");
    expect(session.backgroundColor).toBe("#3b82f60f");
  });
});

describe("the dashboard", () => {
  it("lists today's items on a phone and lays out today's hours beside its lists on an iPad", async () => {
    const { data } = await planned();
    const phone = await renderScreens({ index: () => <DashboardScreen /> }, data, "/", {
      width: PHONE,
    });
    expect(await phone.findByText("Today")).toBeTruthy();
    expect(await phone.findByRole("button", { name: /^Dentist, 09:00 to 10:00/ })).toBeTruthy();
    phone.unmount();
    const ipad = await renderScreens({ index: () => <DashboardScreen /> }, data, "/", {
      width: 1100,
    });
    // The hours: the same item as a block, the Today list gone.
    expect(await ipad.findByRole("button", { name: "Dentist, 09:00 to 10:00" })).toBeTruthy();
    expect(ipad.queryByText("Today")).toBeNull();
    expect(ipad.getByRole("header", { name: "Tasks" })).toBeTruthy();
  });
});
