import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, mockCommand, mockCommandWith } from "#/test/tauri.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import type { MoodleCourse, MoodleFile } from "#/lib/api/moodle.ts";
import { MoodleView } from "./MoodleView.tsx";
import { sortAssignments } from "./CourseAssignments.tsx";
import { orderForums } from "./CourseForums.tsx";
import { orderGradeItems } from "./CourseGrades.tsx";
import { sectionHasContent } from "./CourseContents.tsx";
import { sortCourses } from "./CoursesPage.tsx";

const SITE = "https://moodle.uni.edu";
const NOW = "2026-10-30T10:00:00Z";

const connected = {
  connected: true,
  needsReconnect: false,
  siteUrl: SITE,
  siteName: "Uni Moodle",
  fullName: "Ada Lovelace",
};

const course = (over: Partial<MoodleCourse> = {}): MoodleCourse => ({
  id: 4,
  shortName: "MA1",
  fullName: "Maths 1",
  summary: "",
  startDate: 0,
  endDate: 0,
  progress: null,
  hidden: false,
  ...over,
});

const answer = <T,>(data: T, offline = false) => ({ data, fetchedAt: NOW, offline });

const file = (over: Partial<MoodleFile> = {}): MoodleFile => ({
  kind: "file",
  fileName: "slides.pdf",
  filePath: "/",
  fileSize: 2048,
  fileUrl: `${SITE}/pluginfile.php/1/slides.pdf`,
  timeModified: 5,
  mimeType: "application/pdf",
  ...over,
});

const base = { view: { kind: "dashboard" as const } };

beforeEach(() => {
  useNavStore.setState(base);
  mockCommand("plugin:opener|open_url", null);
});

function open(path?: string) {
  return renderWithProviders(<MoodleView spaceId="s1" moodlePath={path} />);
}

describe("connecting", () => {
  it("asks for the address and opens Moodle's sign in page", async () => {
    mockCommand("moodle_status", { ...connected, connected: false, siteUrl: null });
    mockCommand("moodle_begin_login", `${SITE}/admin/tool/mobile/launch.php?passport=1`);
    const { user } = open();
    await user.type(await screen.findByLabelText(/Moodle address/), "moodle.uni.edu");
    await user.click(screen.getByRole("button", { name: "Sign in with Moodle" }));
    await waitFor(() =>
      expect(callsOf("moodle_begin_login")).toEqual([{ site: "moodle.uni.edu" }]),
    );
    await waitFor(() => expect(callsOf("plugin:opener|open_url")).toHaveLength(1));
    const launch = `${SITE}/admin/tool/mobile/launch.php?passport=1`;
    expect(callsOf("plugin:opener|open_url")[0]).toMatchObject({ url: launch });
    expect(await screen.findByLabelText(/Link from Moodle/)).toBeTruthy();
    // The address is also shown, so a browser that can't be opened from here can be given it.
    expect(screen.getByLabelText("Sign in address")).toHaveValue(launch);
    expect(screen.getByRole("button", { name: "Copy Sign In Address" })).toBeTruthy();
    await expectNoA11yViolations();
  });

  it("says why the address was refused", async () => {
    mockCommand("moodle_status", { ...connected, connected: false, siteUrl: null });
    mockCommandWith("moodle_begin_login", () => {
      throw { kind: "Remote", message: "Moodle sites must use https." };
    });
    const { user } = open();
    await user.type(await screen.findByLabelText(/Moodle address/), "http://moodle.uni.edu");
    await user.click(screen.getByRole("button", { name: "Sign in with Moodle" }));
    expect(await screen.findByText("Moodle sites must use https.")).toBeTruthy();
    expect(callsOf("plugin:opener|open_url")).toHaveLength(0);
  });

  it("offers to connect again when the sign in is gone", async () => {
    mockCommand("moodle_status", { ...connected, connected: false, needsReconnect: true });
    open();
    expect(await screen.findByText("Connect Moodle again")).toBeTruthy();
  });

  it("finishes with a pasted link", async () => {
    mockCommand("moodle_status", { ...connected, connected: false, siteUrl: null });
    mockCommand("moodle_begin_login", `${SITE}/launch`);
    mockCommand("moodle_finish_login", connected);
    const { user } = open();
    await user.type(await screen.findByLabelText(/Moodle address/), "moodle.uni.edu");
    await user.click(screen.getByRole("button", { name: "Sign in with Moodle" }));
    await user.type(await screen.findByLabelText(/Link from Moodle/), "nookly://token=abc");
    await user.click(screen.getByRole("button", { name: "Finish sign in" }));
    await waitFor(() =>
      expect(callsOf("moodle_finish_login")).toEqual([{ callback: "nookly://token=abc" }]),
    );
  });
});

describe("courses", () => {
  beforeEach(() => mockCommand("moodle_status", connected));

  it("lists courses and opens one", async () => {
    mockCommand("moodle_courses", answer([course(), course({ id: 5, fullName: "Physics" })]));
    const { user } = open();
    await user.click(await screen.findByRole("button", { name: /Maths 1/ }));
    expect(useNavStore.getState().view).toEqual({
      kind: "module",
      spaceId: "s1",
      module: "moodle",
      moodlePath: "course/4",
    });
  });

  it("links the page to the same page on Moodle", async () => {
    mockCommand("moodle_courses", answer([course()]));
    const { user } = open();
    await user.click(await screen.findByRole("button", { name: "Open in Moodle" }));
    await waitFor(() => expect(callsOf("plugin:opener|open_url")).toHaveLength(1));
    expect(callsOf("plugin:opener|open_url")[0]).toMatchObject({ url: `${SITE}/my/courses.php` });
  });

  it("says when it is showing the last answer", async () => {
    mockCommand("moodle_courses", answer([course()], true));
    open();
    expect(await screen.findByText(/Offline, as of/)).toBeTruthy();
  });

  it("shows why Moodle refused", async () => {
    mockCommandWith("moodle_courses", () => {
      throw { kind: "Remote", message: "Your Moodle sign in expired. Connect again." };
    });
    open();
    expect(await screen.findByText("Your Moodle sign in expired. Connect again.")).toBeTruthy();
  });

  it("has a way to open an empty list", async () => {
    mockCommand("moodle_courses", answer([]));
    open();
    expect(await screen.findByText("No courses on Moodle")).toBeTruthy();
  });
});

describe("a course", () => {
  beforeEach(() => {
    mockCommand("moodle_status", connected);
    mockCommand("moodle_courses", answer([course()]));
  });

  it("shows sections, descriptions and files, and downloads a file when asked", async () => {
    mockCommand(
      "moodle_contents",
      answer([
        {
          id: 1,
          name: "Week 1",
          summary: "",
          modules: [
            {
              id: 10,
              name: "Slides",
              modName: "resource",
              url: "",
              description: "<p>Read first</p>",
              contents: [file()],
            },
            {
              id: 11,
              name: "Quiz 1",
              modName: "quiz",
              url: `${SITE}/mod/quiz/view.php?id=11`,
              description: "",
              contents: [],
            },
          ],
        },
        { id: 2, name: "Empty week", summary: "<p><br></p>", modules: [] },
      ]),
    );
    mockCommand("moodle_open_file", null);
    const { user } = open("course/4");
    expect(await screen.findByText("Week 1")).toBeTruthy();
    expect(screen.queryByText("Empty week")).toBeNull();
    expect(screen.getByText("Read first")).toBeTruthy();
    expect(screen.getByText("2 KB")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Open in Moodle" }).length).toBeGreaterThan(1);

    await user.click(screen.getByRole("button", { name: "Download and Open" }));
    await waitFor(() =>
      expect(callsOf("moodle_open_file")).toEqual([
        { url: file().fileUrl, fileName: "slides.pdf", timeModified: 5 },
      ]),
    );
  });

  it("switches tabs through the view, so Back works", async () => {
    mockCommand("moodle_contents", answer([]));
    const { user } = open("course/4");
    await user.click(await screen.findByRole("tab", { name: "Grades" }));
    expect(useNavStore.getState().view).toMatchObject({ moodlePath: "course/4/grades" });
  });

  it("lists assignments and opens one with its status and feedback", async () => {
    mockCommand(
      "moodle_assignments",
      answer([
        {
          id: 3,
          cmid: 30,
          name: "Essay",
          dueDate: 1_800_000_000,
          openDate: 0,
          cutOffDate: 0,
          intro: "<p>Write 500 words</p>",
          attachments: [file({ fileName: "brief.pdf" })],
        },
      ]),
    );
    mockCommand(
      "moodle_assignment_status",
      answer({
        submissionStatus: "submitted",
        gradingStatus: "graded",
        grade: "8.5 / 10",
        feedback: ["<p>Well done</p>"],
      }),
    );
    const { user } = open("course/4/assignments/3");
    expect(await screen.findByText("Write 500 words")).toBeTruthy();
    expect(await screen.findByText("Submitted")).toBeTruthy();
    expect(screen.getByText("8.5 / 10")).toBeTruthy();
    expect(screen.getByText("Well done")).toBeTruthy();
    expect(screen.getByText("brief.pdf")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Open in Moodle" }));
    await waitFor(() => expect(callsOf("plugin:opener|open_url")).toHaveLength(1));
    expect(callsOf("plugin:opener|open_url")[0]).toMatchObject({
      url: `${SITE}/mod/assign/view.php?id=30`,
    });
  });

  it("shows grades with the total last", async () => {
    mockCommand(
      "moodle_grades",
      answer([
        {
          id: 2,
          name: null,
          itemType: "course",
          itemModule: null,
          cmid: null,
          grade: "8.0",
          range: "0-10",
          percentage: "80 %",
          weight: null,
          feedback: null,
        },
        {
          id: 1,
          name: "Essay",
          itemType: "mod",
          itemModule: "assign",
          cmid: 30,
          grade: "8.5",
          range: "0-10",
          percentage: "85 %",
          weight: "50 %",
          feedback: "<p>Nice</p>",
        },
      ]),
    );
    open("course/4/grades");
    const rows = await screen.findAllByRole("row");
    expect(within(rows[1]!).getByText("Essay")).toBeTruthy();
    expect(screen.getByText("Nice")).toBeTruthy();
    expect(screen.getByText("Course total")).toBeTruthy();
  });

  it("reads announcements and a discussion", async () => {
    mockCommand(
      "moodle_forums",
      answer([
        { id: 1, cmid: 50, name: "Announcements", kind: "news", intro: "", numDiscussions: 1 },
      ]),
    );
    mockCommand(
      "moodle_discussions",
      answer([
        {
          discussionId: 12,
          name: "Exam dates",
          subject: "Exam dates",
          message: "",
          author: "Prof X",
          timeModified: 1_800_000_000,
          numReplies: 1,
          pinned: true,
          attachments: [],
        },
      ]),
    );
    mockCommand(
      "moodle_posts",
      answer([
        {
          id: 900,
          parentId: 0,
          subject: "Exam dates",
          message: "<p>The exam is in May</p>",
          author: { fullName: "Prof X" },
          timeCreated: 1_800_000_000,
          attachments: [file({ fileName: "dates.pdf" })],
        },
      ]),
    );
    const { user } = open("course/4/forums/1");
    await user.click(await screen.findByRole("button", { name: /Exam dates/ }));
    expect(useNavStore.getState().view).toMatchObject({ moodlePath: "course/4/forums/1/12" });
  });

  it("shows a discussion's posts and attachments", async () => {
    mockCommand("moodle_forums", answer([]));
    mockCommand("moodle_discussions", answer([]));
    mockCommand(
      "moodle_posts",
      answer([
        {
          id: 900,
          parentId: 0,
          subject: "Exam dates",
          message: "<p>The exam is in May</p><script>alert(1)</script>",
          author: { fullName: "Prof X" },
          timeCreated: 1_800_000_000,
          attachments: [file({ fileName: "dates.pdf" })],
        },
      ]),
    );
    open("course/4/forums/1/12");
    expect(await screen.findByText("The exam is in May")).toBeTruthy();
    expect(screen.getByText("Prof X")).toBeTruthy();
    expect(screen.getByText("dates.pdf")).toBeTruthy();
    expect(document.querySelector("script")).toBeNull();
    await expectNoA11yViolations();
  });

  it("reads a Moodle page", async () => {
    mockCommand(
      "moodle_contents",
      answer([
        {
          id: 1,
          name: "Week 1",
          summary: "",
          modules: [
            {
              id: 30,
              name: "Reading list",
              modName: "page",
              url: "",
              description: "",
              contents: [
                file({ fileName: "index.html", fileUrl: `${SITE}/pluginfile.php/9/index.html` }),
              ],
            },
          ],
        },
      ]),
    );
    mockCommandWith("moodle_file_text", () => "<h2>Books</h2><p>Chapter 1</p>");
    open("course/4/page/30");
    expect(await screen.findByText("Chapter 1")).toBeTruthy();
    expect(callsOf("moodle_file_text")).toEqual([{ url: `${SITE}/pluginfile.php/9/index.html` }]);
  });
});

describe("ordering", () => {
  it("puts current courses before finished ones and drops hidden ones", () => {
    const now = 1_000;
    const names = sortCourses(
      [
        course({ id: 1, fullName: "B past", endDate: 500 }),
        course({ id: 2, fullName: "A current", endDate: 5_000 }),
        course({ id: 3, fullName: "Hidden", hidden: true }),
        course({ id: 4, fullName: "C no end" }),
      ],
      now,
    ).map((c) => c.fullName);
    expect(names).toEqual(["A current", "C no end", "B past"]);
  });

  it("puts assignments by due date, undated last", () => {
    const a = (id: number, dueDate: number, name = `n${id}`) => ({
      id,
      cmid: id,
      name,
      dueDate,
      openDate: 0,
      cutOffDate: 0,
      intro: "",
      attachments: [],
    });
    expect(sortAssignments([a(1, 0), a(2, 300), a(3, 100)]).map((x) => x.id)).toEqual([3, 2, 1]);
  });

  it("puts announcements before forums and the grade total last", () => {
    const f = (id: number, kind: string, name: string) => ({
      id,
      cmid: id,
      name,
      kind,
      intro: "",
      numDiscussions: 0,
    });
    expect(orderForums([f(1, "general", "A"), f(2, "news", "Z")]).map((x) => x.id)).toEqual([2, 1]);
    const g = (id: number, itemType: string) => ({
      id,
      name: null,
      itemType,
      itemModule: null,
      cmid: null,
      grade: null,
      range: null,
      percentage: null,
      weight: null,
      feedback: null,
    });
    expect(orderGradeItems([g(1, "course"), g(2, "mod")]).map((x) => x.id)).toEqual([2, 1]);
  });

  it("skips sections with nothing in them", () => {
    expect(sectionHasContent({ id: 1, name: "", summary: "<p><br></p>", modules: [] })).toBe(false);
    expect(sectionHasContent({ id: 1, name: "", summary: "<p>Hi</p>", modules: [] })).toBe(true);
  });
});
