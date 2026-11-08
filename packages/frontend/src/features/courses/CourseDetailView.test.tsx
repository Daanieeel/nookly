import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PageSummary, Relationship } from "#/lib/api/types.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import {
  makeAssignment,
  makeCalendarEntry,
  makeEntity,
  makeExam,
  makeSession,
  makeTask,
  STATUSES,
} from "#/test/fixtures.ts";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { preferences } from "#/lib/preferences.ts";
import { STORAGE_KEYS } from "#/lib/storage-keys.ts";
import { renderWithProviders } from "#/test/render.tsx";
import {
  installTauriMock,
  mockCommand,
  mockCommandWith,
  uninstallTauriMock,
} from "#/test/tauri.ts";
import { CourseDetailView } from "./CourseDetailView.tsx";

const initialNav = useNavStore.getState();
const course = makeEntity({ id: "c1", type: "course", title: "Algorithms", key: "CRS-1" });
const otherCourse = makeEntity({ id: "c2", type: "course", title: "Databases", key: "CRS-2" });

const link = (from: string, type: string): Relationship => ({
  id: `${from}-${type}`,
  fromEntityId: from,
  toEntityId: "c1",
  relationshipType: type,
  fromBlockId: null,
  toBlockId: null,
  createdAt: "2026-03-01T00:00:00.000Z",
});

/// A link from the Course to `to`, like its Notes.
const linkFrom = (type: string, to: string): Relationship => ({
  ...link("c1", type),
  id: `c1-${type}-${to}`,
  toEntityId: to,
});

// Wednesday 11 March 2026, 8:00. Only the date is faked, so queries still settle.
const NOW = new Date(2026, 2, 11, 8, 0);

const mine = makeSession(
  { date: "2026-03-12", startTime: "10:00", endTime: "11:30" },
  { id: "s-mine", title: "Algorithms Lecture" },
);
const theirs = makeSession(
  { date: "2026-03-12", startTime: "13:00", endTime: "14:00" },
  { id: "s-theirs", title: "Databases Lecture" },
);
const dentist = makeCalendarEntry(
  { date: "2026-03-12", startTime: "15:00", endTime: "16:00" },
  { id: "entry-1", title: "Dentist" },
);

function note(id: string, title: string, editedAt: string, courses = [course]): PageSummary {
  return {
    entity: makeEntity({ id, type: "note", title }),
    preview: "",
    lastEditedAt: editedAt,
    labelIds: [],
    linked: [],
    session: null,
    courses,
  };
}

beforeEach(() => {
  // jsdom has no layout; the editor's block handles probe the point under the pointer.
  document.elementFromPoint = () => null;
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  installTauriMock();
  mockCommand("get_course_notes", makeEntity({ id: "course-notes", type: "note", title: "Notes" }));
  mockCommand("list_blocks", []);
  mockCommandWith("list_relationships", (args) =>
    new Map(Object.entries(args ?? {})).get("entityId") === "c1"
      ? [
          link("s-mine", "session-course"),
          link("e-mine", "exam-course"),
          link("a-open", "assignment-course"),
          linkFrom("course-notes", "n2"),
          linkFrom("relates-to", "t-mine"),
        ]
      : [],
  );
  mockCommand("list_sessions", [mine, theirs]);
  mockCommand("list_sessions_all", [mine, theirs]);
  mockCommand("list_calendar_entries_all", [dentist]);
  mockCommand("list_external_events", []);
  mockCommand("list_exams", [
    makeExam({ examDate: "2026-03-20" }, { id: "e-mine", title: "Final" }),
    makeExam({ examDate: "2026-03-18" }, { id: "e-other", title: "Joins exam" }),
  ]);
  mockCommand("list_exams_all_spaces", []);
  mockCommand("list_assignments", [
    makeAssignment(
      { status: "in_progress", dueDate: "2026-03-14" },
      { id: "a-open", title: "Sheet 1" },
    ),
    makeAssignment({ status: "in_progress" }, { id: "a-other", title: "Foreign sheet" }),
  ]);
  mockCommand("list_tasks", [
    makeTask({ statusId: "todo" }, { id: "t-mine", title: "Revise graphs", key: "TSK-4" }),
    makeTask({ statusId: "todo" }, { id: "t-other", title: "Water plants", key: "TSK-5" }),
  ]);
  mockCommand("list_tasks_all", []);
  mockCommand("list_task_statuses", STATUSES);
  mockCommand("list_courses", [course, otherCourse]);
  mockCommand("list_relationship_types", []);
  mockCommand("list_decks", []);
  mockCommand("list_spaces", []);
  mockCommand("get_course_grades", { grade: null, gradedWeight: 0, gradedCount: 0, itemCount: 0 });
  mockCommand("get_course_details", { professor: null });
  mockCommand("list_labels", []);
  mockCommand("list_note_summaries", [
    note("n1", "Oldest note", "2026-01-01T10:00:00.000Z"),
    note("n2", "Newest note", "2026-03-10T10:00:00.000Z"),
    note("n3", "Other course note", "2026-03-11T07:00:00.000Z", [otherCourse]),
    note("n4", "Second note", "2026-03-09T10:00:00.000Z"),
    note("n5", "Third note", "2026-03-08T10:00:00.000Z"),
    note("n6", "Fourth note", "2026-03-07T10:00:00.000Z"),
    note("n7", "Fifth note", "2026-03-06T10:00:00.000Z"),
  ]);
});
afterEach(() => {
  Reflect.deleteProperty(document, "elementFromPoint");
  vi.useRealTimers();
  uninstallTauriMock();
  useNavStore.setState(initialNav, true);
});

/// The nearest ancestor of `element` matching `selector`, which the page is built to have.
function closestOf(element: Element, selector: string): HTMLElement {
  const found = element.closest<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector} around ${element.tagName}`);
  return found;
}

const renderCourse = () => renderWithProviders(<CourseDetailView entity={course} />);

describe("the course page", () => {
  const SECTIONS = ["Sessions", "Assignments", "Tasks", "Exams", "Notes"];
  const sectionHeadings = () =>
    screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent ?? "")
      .filter((h) => SECTIONS.includes(h));

  it("orders its parts: notes editor, stat boxes, then a section per related type", async () => {
    renderCourse();
    await screen.findByRole("heading", { name: "Notes" });
    expect(sectionHeadings()).toEqual(SECTIONS);
    const editor = await waitFor(() => {
      const found = document.querySelector(".tiptap-content");
      if (!found) throw new Error("the editor has not mounted");
      return found;
    });
    const stats = screen.getByText("Next Session");
    const sessions = screen.getByRole("heading", { name: "Sessions" });
    expect(editor?.compareDocumentPosition(stats)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(stats.compareDocumentPosition(sessions)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("names the next session in its stat box, with its time and how soon", async () => {
    renderCourse();
    const box = closestOf(await screen.findByText("Next Session"), "[data-slot$=card]");
    await waitFor(() => expect(within(box).getByText("Algorithms Lecture")).toBeInTheDocument());
    expect(within(box).getByText(/Thu.*10:00/)).toBeInTheDocument();
    expect(within(box).getByText("in 1d")).toBeInTheDocument();
  });

  it("shows this week of the calendar, the course's own items plain and the rest faded", async () => {
    renderCourse();
    const week = await screen.findByRole("region", { name: "This week" });
    const block = (title: string) =>
      closestOf(within(week).getAllByText(title)[0], "[data-calendar-item]");
    await waitFor(() => expect(block("Algorithms Lecture")).toBeTruthy());
    expect(block("Algorithms Lecture").className).not.toContain("opacity-40");
    expect(block("Databases Lecture").className).toContain("opacity-40");
    expect(block("Dentist").className).toContain("opacity-40");
  });

  it("lists the course's assignments with a named status, and their count", async () => {
    renderCourse();
    const section = await screen.findByRole("region", { name: "Assignments" });
    expect(await within(section).findByText("Sheet 1")).toBeInTheDocument();
    expect(within(section).getByText("In progress")).toBeInTheDocument();
    expect(within(section).queryByText("Foreign sheet")).toBeNull();
    expect(within(section).getByText("1")).toBeInTheDocument();
  });

  it("lists the tasks related to the course", async () => {
    renderCourse();
    const section = await screen.findByRole("region", { name: "Tasks" });
    expect(await within(section).findByText("Revise graphs")).toBeInTheDocument();
    expect(within(section).queryByText("Water plants")).toBeNull();
  });

  it("lists the course's exams", async () => {
    renderCourse();
    const section = await screen.findByRole("region", { name: "Exams" });
    expect(await within(section).findByText("Final")).toBeInTheDocument();
    expect(within(section).queryByText("Joins exam")).toBeNull();
  });

  it("lists the course's notes, also those written for its sessions, newest first", async () => {
    renderCourse();
    const section = await screen.findByRole("region", { name: "Notes" });
    await within(section).findByText("Newest note");
    const rows = within(section)
      .getAllByRole("row")
      .slice(1)
      .map((r) => r.textContent?.match(/(Newest|Second|Third|Fourth|Fifth|Oldest) note/)?.[0]);
    expect(rows).toEqual([
      "Newest note",
      "Second note",
      "Third note",
      "Fourth note",
      "Fifth note",
      "Oldest note",
    ]);
    expect(within(section).queryByText("Other course note")).toBeNull();
  });

  it("opens the Notes page on this course from the section's View all", async () => {
    const { user } = renderCourse();
    const section = await screen.findByRole("region", { name: "Notes" });
    await user.click(within(section).getByRole("button", { name: /View all/ }));
    expect(useNavStore.getState().view).toEqual({
      kind: "module",
      spaceId: "space-1",
      module: "notes",
      filterCourseId: "c1",
    });
  });

  it("still opens a filtered page from the other sections' View all", async () => {
    const { user } = renderCourse();
    const section = await screen.findByRole("region", { name: "Assignments" });
    await act(async () => {
      await user.click(within(section).getByRole("button", { name: /View all/ }));
    });
    expect(useNavStore.getState().view).toMatchObject({
      module: "assignments",
      filterCourseId: "c1",
    });
  });

  it("folds a section from its title and remembers it", async () => {
    const { user, unmount } = renderCourse();
    const section = await screen.findByRole("region", { name: "Assignments" });
    await within(section).findByText("Sheet 1");
    const toggle = within(section).getByRole("button", { name: "Assignments" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(section).queryByText("Sheet 1")).toBeNull();
    // The count stays, so a folded section still says what it holds.
    expect(within(section).getByText("1")).toBeInTheDocument();

    unmount();
    renderCourse();
    const again = await screen.findByRole("region", { name: "Assignments" });
    expect(within(again).getByRole("button", { name: "Assignments" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("hides a section from Customize sections, and shows it again", async () => {
    const { user } = renderCourse();
    await screen.findByRole("region", { name: "Exams" });
    await user.click(screen.getByRole("button", { name: "Customize sections" }));
    // Only the popover: the Course's notes editor is checked with the editor.
    await expectNoA11yViolations(await screen.findByRole("dialog", { name: "Customize sections" }));
    await user.click(screen.getByRole("button", { name: "Hide Exams" }));
    expect(screen.queryByRole("region", { name: "Exams" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Show Exams" }));
    expect(await screen.findByRole("region", { name: "Exams" })).toBeInTheDocument();
  });

  it("shows the sections in the order the user saved", async () => {
    preferences.set(
      STORAGE_KEYS.pageSections,
      // Assignments and Tasks are missing, so they follow Sessions as they do by default.
      JSON.stringify({ course: [{ id: "notes" }, { id: "exams" }, { id: "sessions" }] }),
    );
    renderCourse();
    await screen.findByRole("region", { name: "Notes" });
    expect(sectionHeadings()).toEqual(["Notes", "Exams", "Sessions", "Assignments", "Tasks"]);
  });

  it("adds to a section from its +, with the picker already on that type", async () => {
    const { user } = renderCourse();
    const section = await screen.findByRole("region", { name: "Tasks" });
    await user.click(within(section).getByRole("button", { name: "Add Task" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});
