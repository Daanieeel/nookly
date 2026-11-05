import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, mockCommand, mockCommandWith } from "#/test/tauri.ts";
import { qk } from "#/lib/query-keys.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import type { MoodleCourse, MoodleFile } from "#/lib/api/moodle.ts";
import { makeEntity, makeFile, makeLabel } from "#/test/fixtures.ts";
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
  overviewFiles: [],
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
  // Nothing is imported unless a test says so.
  mockCommand("list_files", []);
});

function open(path?: string) {
  return renderWithProviders(<MoodleView spaceId="s1" moodlePath={path} />);
}

describe("connecting", () => {
  const signedOut = () =>
    mockCommand("moodle_status", { ...connected, connected: false, siteUrl: null });

  it("asks for the address and signs in inside Nookly", async () => {
    signedOut();
    mockCommand("moodle_open_login", null);
    const { user } = open();
    await user.type(await screen.findByLabelText(/Moodle address/), "moodle.uni.edu");
    await user.click(screen.getByRole("button", { name: "Sign in with Moodle" }));
    await waitFor(() => expect(callsOf("moodle_open_login")).toEqual([{ site: "moodle.uni.edu" }]));
    // No browser: it would not hand Moodle's redirect back to the app.
    expect(callsOf("plugin:opener|open_url")).toHaveLength(0);
    expect(await screen.findByText(/Sign in in the window that opened/)).toBeTruthy();
    await expectNoA11yViolations();
  });

  it("says why the address was refused", async () => {
    signedOut();
    mockCommandWith("moodle_open_login", () => {
      throw { kind: "Remote", message: "Moodle sites must use https." };
    });
    const { user } = open();
    await user.type(await screen.findByLabelText(/Moodle address/), "http://moodle.uni.edu");
    await user.click(screen.getByRole("button", { name: "Sign in with Moodle" }));
    expect(await screen.findByText("Moodle sites must use https.")).toBeTruthy();
  });

  it("offers to connect again when the sign in is gone", async () => {
    mockCommand("moodle_status", { ...connected, connected: false, needsReconnect: true });
    open();
    expect(await screen.findByText("Connect Moodle again")).toBeTruthy();
  });
});

describe("a sign in that reached the app", () => {
  it("shows why it failed on the page, not only in a toast", async () => {
    mockCommand("moodle_status", { ...connected, connected: false, siteUrl: null });
    const { queryClient } = open();
    await screen.findByLabelText(/Moodle address/);
    act(() => {
      queryClient.setQueryData(qk.moodle.signIn, {
        kind: "failed",
        message: "No Moodle sign in is waiting. Start it again from Nookly.",
      });
    });
    expect(await screen.findByText(/No Moodle sign in is waiting/)).toBeTruthy();
  });

  it("says it is finishing the sign in", async () => {
    mockCommand("moodle_status", { ...connected, connected: false, siteUrl: null });
    const { queryClient } = open();
    await screen.findByLabelText(/Moodle address/);
    act(() => {
      queryClient.setQueryData(qk.moodle.signIn, { kind: "finishing" });
    });
    expect(await screen.findByText("Finishing the sign in...")).toBeTruthy();
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

  it("says kindly why Moodle refused, keeps its own words, and can try again", async () => {
    let asked = 0;
    mockCommandWith("moodle_courses", () => {
      asked += 1;
      if (asked === 1)
        throw { kind: "Remote", message: "Your Moodle sign in expired. Connect again." };
      return answer([course()]);
    });
    const { user } = open();
    expect(await screen.findByText("Your sign in ran out")).toBeTruthy();
    expect(screen.getByText("Your Moodle sign in expired. Connect again.")).toBeTruthy();
    await expectNoA11yViolations();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: /Maths 1/ })).toBeTruthy();
  });

  it("signs out, forgets what it showed and asks to connect again", async () => {
    let signedIn = true;
    mockCommandWith("moodle_status", () => ({ ...connected, connected: signedIn }));
    mockCommand("moodle_courses", answer([course()]));
    mockCommandWith("moodle_disconnect", () => {
      signedIn = false;
      return null;
    });
    const { user, queryClient } = open();
    expect(await screen.findByText("Welcome back, Ada")).toBeTruthy();
    await user.click(await screen.findByRole("button", { name: /^Sign out Ada Lovelace/ }));
    await waitFor(() => expect(callsOf("moodle_disconnect")).toHaveLength(1));
    expect(await screen.findByText("Connect your Moodle")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Maths 1/ })).toBeNull();
    expect(queryClient.getQueryData(qk.moodle.courses)).toBeUndefined();
  });

  it("says why signing out failed and stays signed in", async () => {
    mockCommand("moodle_courses", answer([course()]));
    mockCommandWith("moodle_disconnect", () => {
      throw { kind: "Remote", message: "Couldn't access the system keychain: locked" };
    });
    const { user } = open();
    await user.click(await screen.findByRole("button", { name: /^Sign out/ }));
    expect(await screen.findByText(/system keychain/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Maths 1/ })).toBeTruthy();
  });

  it("greets by the first name when the site writes the surname first", async () => {
    mockCommand("moodle_status", { ...connected, fullName: "Lovelace, Ada" });
    mockCommand("moodle_courses", answer([course()]));
    open();
    expect(await screen.findByText("Welcome back, Ada")).toBeTruthy();
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
    // What a file says about itself, on its row: type, size and when it changed.
    expect(screen.getByText(/^PDF · 2 KB · /)).toBeTruthy();
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
    const essay = (await screen.findAllByRole("listitem"))[0]!;
    expect(within(essay).getByText("Essay")).toBeTruthy();
    expect(within(essay).getByText("Weight 50 %")).toBeTruthy();
    expect(within(essay).getByRole("progressbar", { name: /Essay/ })).toHaveAttribute(
      "value",
      "85",
    );
    expect(screen.getByText("Nice")).toBeTruthy();
    // The total comes first as a card of its own, not among the items.
    expect(screen.getByText("Course total")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
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

describe("a file of a course", () => {
  const withFiles = (modName: string, contents: MoodleFile[], name = "Slides") => {
    mockCommand("moodle_status", connected);
    mockCommand("moodle_courses", answer([course()]));
    mockCommand(
      "moodle_contents",
      answer([
        {
          id: 1,
          name: "Week 1",
          summary: "",
          modules: [{ id: 10, name, modName, url: "", description: "", contents }],
        },
      ]),
    );
  };

  it("opens in Nookly, in a new tab, with a click on its row", async () => {
    withFiles("resource", [file()]);
    const { user } = open("course/4");
    const tabsBefore = useNavStore.getState().tabs.length;
    await user.click(await screen.findByRole("button", { name: /Slides/ }));
    expect(useNavStore.getState().view).toMatchObject({ moodlePath: "course/4/file/10/0" });
    expect(useNavStore.getState().tabs.length).toBe(tabsBefore + 1);
    expect(useNavStore.getState().backStack).toEqual([]);
    expect(callsOf("moodle_open_file")).toHaveLength(0);
  });

  /// A Space with a label and a course of Nookly, and nothing imported yet.
  const space = (imported: ReturnType<typeof makeFile>[] = []) => {
    mockCommand("list_files", imported);
    mockCommand("list_labels", [makeLabel({ id: "lb1", name: "Lectures", color: "#112233" })]);
    mockCommand("list_courses", [makeEntity({ id: "nc1", type: "course", title: "Maths 1" })]);
    mockCommand("moodle_file_path", "/data/moodle-files/ab12/slides.pdf");
  };
  const imported = (over: Partial<MoodleFile> = {}) =>
    makeFile(
      { origin: `moodle:${file(over).fileUrl}` },
      { id: "f1", title: "Slides.pdf", spaceId: "s1" },
    );

  it("opens a dialog to name and label the file, with suggestions, before it is imported", async () => {
    withFiles("resource", [file()], "Lecture 1 slides");
    space();
    mockCommand("import_file_with_details", makeFile({}, { id: "f1" }));
    const { user } = open("course/4");
    await user.click(await screen.findByRole("button", { name: "Import into Nookly" }));
    const dialog = await screen.findByRole("dialog", { name: "Import into Nookly" });
    // The item's name with the file's extension, the course label ready to go, the course
    // of Nookly with the same name already chosen.
    expect(within(dialog).getByLabelText("Name")).toHaveProperty("value", "Lecture 1 slides.pdf");
    // The file's own name is one click away.
    expect(within(dialog).getByRole("button", { name: "slides.pdf" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: /MA1/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(
      within(dialog)
        .getByRole("button", { name: /Week 1/ })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    expect(within(dialog).getByRole("combobox", { name: "Attach to a course" }).textContent).toBe(
      "Maths 1",
    );
    // Nothing is imported until the button is pressed.
    expect(callsOf("import_file_with_details")).toHaveLength(0);
    await expectNoA11yViolations();
  });

  it("imports with the name, labels and course chosen in the dialog", async () => {
    withFiles("resource", [file()]);
    space();
    mockCommand("import_file_with_details", makeFile({}, { id: "f1" }));
    const { user } = open("course/4");
    await user.click(await screen.findByRole("button", { name: "Import into Nookly" }));
    const dialog = await screen.findByRole("dialog", { name: "Import into Nookly" });
    const name = within(dialog).getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Week 1 slides");
    await user.click(within(dialog).getByRole("button", { name: "Lectures" }));
    await user.click(within(dialog).getByRole("button", { name: /Week 1New/ }));
    await user.type(within(dialog).getByLabelText("Labels"), "Exam{Enter}");
    await user.click(within(dialog).getByRole("button", { name: "Import" }));
    await waitFor(() =>
      expect(callsOf("import_file_with_details")).toEqual([
        {
          spaceId: "s1",
          sourcePath: "/data/moodle-files/ab12/slides.pdf",
          details: {
            origin: `moodle:${file().fileUrl}`,
            title: "Week 1 slides",
            labelIds: ["lb1"],
            newLabels: [
              { name: "MA1", color: expect.any(String) },
              { name: "Week 1", color: expect.any(String) },
              { name: "Exam", color: expect.any(String) },
            ],
            attachTo: ["nc1"],
          },
        },
      ]),
    );
    // The legacy way in, with no say over the File, is not used.
    expect(callsOf("import_file")).toHaveLength(0);
  });

  it("reuses a label of the Space the course is already named by, instead of making a second", async () => {
    withFiles("resource", [file()]);
    space();
    mockCommand("list_labels", [makeLabel({ id: "lb2", name: "ma1" })]);
    const { user } = open("course/4");
    await user.click(await screen.findByRole("button", { name: "Import into Nookly" }));
    const dialog = await screen.findByRole("dialog", { name: "Import into Nookly" });
    expect(within(dialog).getByRole("button", { name: "ma1" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(within(dialog).queryByRole("button", { name: /MA1New/ })).toBeNull();
  });

  it("says in place when the import failed, and keeps the dialog", async () => {
    withFiles("resource", [file()]);
    space();
    mockCommandWith("import_file_with_details", () => {
      throw { kind: "Io", message: "No room left on this disk." };
    });
    const { user } = open("course/4");
    await user.click(await screen.findByRole("button", { name: "Import into Nookly" }));
    const dialog = await screen.findByRole("dialog", { name: "Import into Nookly" });
    await user.click(within(dialog).getByRole("button", { name: "Import" }));
    expect(await within(dialog).findByText("No room left on this disk.")).toBeTruthy();
  });

  it("will not import a file with no name", async () => {
    withFiles("resource", [file()]);
    space();
    const { user } = open("course/4");
    await user.click(await screen.findByRole("button", { name: "Import into Nookly" }));
    const dialog = await screen.findByRole("dialog", { name: "Import into Nookly" });
    await user.clear(within(dialog).getByLabelText("Name"));
    expect(within(dialog).getByRole("button", { name: "Import" })).toHaveProperty("disabled", true);
  });

  it("shows where the file is in Nookly once it was imported, instead of importing it again", async () => {
    withFiles("resource", [file()]);
    space([imported()]);
    useNavStore.setState({ view: { kind: "dashboard" } });
    const { user } = open("course/4");
    await user.click(await screen.findByRole("button", { name: "Show in Nookly" }));
    expect(useNavStore.getState().view).toMatchObject({
      kind: "entity",
      entityId: "f1",
      spaceId: "s1",
    });
    expect(screen.queryByRole("button", { name: "Import into Nookly" })).toBeNull();
  });

  it("offers the import again for a file that was imported and then deleted", async () => {
    withFiles("resource", [file()]);
    // The Space no longer lists it: a deleted File is not in the list.
    space([]);
    open("course/4");
    expect(await screen.findByRole("button", { name: "Import into Nookly" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Show in Nookly" })).toBeNull();
  });

  it("does not take another file for the imported one", async () => {
    withFiles("resource", [file()]);
    space([imported({ fileUrl: `${SITE}/pluginfile.php/1/other.pdf` })]);
    open("course/4");
    expect(await screen.findByRole("button", { name: "Import into Nookly" })).toBeTruthy();
  });

  it("offers no import for a link", async () => {
    withFiles("resource", [file({ kind: "url", fileName: "Site", fileUrl: "https://x.edu" })]);
    open("course/4");
    await screen.findByText("Week 1");
    expect(screen.queryByRole("button", { name: "Import into Nookly" })).toBeNull();
  });

  it("shows a picture right on the page, once the file is on this computer", async () => {
    withFiles("resource", [file({ fileName: "plan.png", mimeType: "image/png" })], "Plan");
    mockCommand("moodle_file_path", "/data/moodle-files/ab12/plan.png");
    const { container } = open("course/4/file/10/0");
    await waitFor(() => expect(container.querySelector('img[alt="plan.png"]')).not.toBeNull());
    expect(callsOf("moodle_file_path")).toEqual([
      { url: file().fileUrl, fileName: "plan.png", timeModified: 5 },
    ]);
    expect(screen.getByRole("heading", { name: "Plan" })).toBeTruthy();
  });

  it("reads like a File of the Space: no banner, and the facts and actions in a sidebar", async () => {
    withFiles("resource", [file({ fileName: "plan.png", fileSize: 4096 })], "Plan");
    mockCommand("moodle_file_path", "/data/moodle-files/ab12/plan.png");
    mockCommand("list_files", []);
    mockCommand("list_labels", []);
    mockCommand("list_courses", []);
    mockCommand("import_file_with_details", makeFile({}, { id: "f1" }));
    const { user } = open("course/4/file/10/0");
    const properties = await screen.findByRole("region", { name: "Properties" });
    // The kind is named and drawn as everywhere in Nookly.
    expect(within(properties).getByText("Image")).toBeTruthy();
    expect(within(properties).getByText("4 KB")).toBeTruthy();
    expect(within(properties).getByText("Maths 1")).toBeTruthy();
    // The actions are buttons with words on them, and long values wrap instead of being cut.
    const actions = screen.getByRole("region", { name: "Actions" });
    expect(
      within(actions)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Import into Nookly", "Download", "Open in Moodle"]);
    expect(within(properties).getByText("plan.png").className).toContain("wrap-anywhere");
    await expectNoA11yViolations();
    // No Moodle banner over the viewer.
    expect(screen.queryByRole("navigation", { name: "Where you are in Moodle" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Import into Nookly" }));
    const dialog = await screen.findByRole("dialog", { name: "Import into Nookly" });
    await user.click(within(dialog).getByRole("button", { name: "Import" }));
    await waitFor(() => expect(callsOf("import_file_with_details")).toHaveLength(1));
  });

  it("shows Show in Nookly in the sidebar for a file that was imported", async () => {
    withFiles("resource", [file({ fileName: "plan.png", mimeType: "image/png" })], "Plan");
    mockCommand("moodle_file_path", "/data/moodle-files/ab12/plan.png");
    mockCommand("list_files", [imported({ fileName: "plan.png", mimeType: "image/png" })]);
    open("course/4/file/10/0");
    const actions = await screen.findByRole("region", { name: "Actions" });
    await waitFor(() =>
      expect(
        within(actions)
          .getAllByRole("button")
          .map((b) => b.textContent),
      ).toEqual(["Show in Nookly", "Download", "Open in Moodle"]),
    );
  });

  it("says when Nookly cannot show the kind of file, and hands it to another app", async () => {
    withFiles("resource", [file({ fileName: "data.bin", mimeType: "application/octet-stream" })]);
    mockCommand("moodle_file_path", "/data/moodle-files/ab12/data.bin");
    mockCommand("moodle_open_file", null);
    const { user } = open("course/4/file/10/0");
    expect(await screen.findByText(/files open in their own app/)).toBeTruthy();
    // Not the buttons that work on a File of the Space: this one is not in it.
    expect(screen.queryByRole("button", { name: "Open" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Open with another app" }));
    await waitFor(() => expect(callsOf("moodle_open_file")).toHaveLength(1));
  });

  it("shows source code in the same viewer as Files do, a Java file for one", async () => {
    withFiles("resource", [file({ fileName: "Main.java", mimeType: "text/x-java" })], "Main");
    mockCommand("moodle_file_path", "/data/moodle-files/ab12/Main.java");
    const fetchText = vi.fn(async () => new Response("public class Main {}"));
    vi.stubGlobal("fetch", fetchText);
    open("course/4/file/10/0");
    expect(await screen.findByText(/public/)).toBeTruthy();
    expect(screen.queryByText(/files open in their own app/)).toBeNull();
    vi.unstubAllGlobals();
  });

  it("lists the files of a folder, each one opening on its own", async () => {
    withFiles(
      "folder",
      [
        file({ fileName: "a.pdf" }),
        file({ fileName: "b.pdf", fileUrl: `${SITE}/pluginfile.php/1/b.pdf` }),
      ],
      "Exercises",
    );
    const { user } = open("course/4");
    expect(await screen.findByText(/Folder · 2 files/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /^b\.pdf/ }));
    expect(useNavStore.getState().view).toMatchObject({ moodlePath: "course/4/file/10/1" });
  });

  it("goes straight to a forum or an assignment of the course, not to a tab", async () => {
    mockCommand("moodle_status", connected);
    mockCommand("moodle_courses", answer([course()]));
    mockCommand(
      "moodle_contents",
      answer([
        {
          id: 1,
          name: "Week 1",
          summary: "",
          modules: [
            { id: 50, name: "News", modName: "forum", url: "", description: "", contents: [] },
            { id: 30, name: "Essay", modName: "assign", url: "", description: "", contents: [] },
          ],
        },
      ]),
    );
    mockCommand(
      "moodle_forums",
      answer([{ id: 7, cmid: 50, name: "News", kind: "news", intro: "", numDiscussions: 3 }]),
    );
    mockCommand(
      "moodle_assignments",
      answer([
        {
          id: 9,
          cmid: 30,
          name: "Essay",
          dueDate: 1_900_000_000,
          openDate: 0,
          cutOffDate: 0,
          intro: "",
          attachments: [],
        },
      ]),
    );
    const { user } = open("course/4");
    expect(await screen.findByText("Announcements · 3 discussions")).toBeTruthy();
    expect(screen.getByText(/^Assignment · Due /)).toBeTruthy();
    // No notice that it only leads to a tab.
    expect(screen.queryByText(/Opens the/)).toBeNull();
    await user.click(screen.getByRole("button", { name: /^News/ }));
    expect(useNavStore.getState().view).toMatchObject({ moodlePath: "course/4/forums/7" });
    await user.click(screen.getByRole("button", { name: /^Essay/ }));
    expect(useNavStore.getState().view).toMatchObject({ moodlePath: "course/4/assignments/9" });
  });

  it("explains a file that is gone from the course", async () => {
    withFiles("resource", [file()]);
    open("course/4/file/10/5");
    expect(await screen.findByText("This file is gone")).toBeTruthy();
  });
});

describe("when a part of a course cannot be read", () => {
  const signedIn = () => {
    mockCommand("moodle_status", connected);
    mockCommand("moodle_courses", answer([course()]));
  };

  it("keeps the course page and explains the grades, with a way to read them on Moodle", async () => {
    signedIn();
    mockCommandWith("moodle_grades", () => {
      throw {
        kind: "Remote",
        message:
          "Moodle doesn't allow Nookly to read this (gradereport_user_get_grade_items: nopermissiontoviewgrades).",
      };
    });
    open("course/4/grades");
    expect(await screen.findByText("Grades aren't shown for this course")).toBeTruthy();
    // The rest of the course is still there.
    expect(screen.getByRole("tab", { name: /Contents/ })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Open in Moodle" })).toHaveLength(2);
    expect(screen.getByText(/nopermissiontoviewgrades/)).toBeTruthy();
  });

  it("explains an answer it cannot read", async () => {
    signedIn();
    mockCommandWith("moodle_contents", () => {
      throw { kind: "Remote", message: "Moodle answered in a way Nookly can't read." };
    });
    open("course/4");
    expect(await screen.findByText("Moodle sent something Nookly can't read")).toBeTruthy();
  });

  it("explains a Moodle that cannot be reached without offering the website", async () => {
    signedIn();
    mockCommandWith("moodle_assignments", () => {
      throw { kind: "Remote", message: "Couldn't reach Moodle." };
    });
    open("course/4/assignments");
    expect(await screen.findByText("Can't reach Moodle")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Open in Moodle" })).toHaveLength(1);
  });

  it("has an empty page of its own for each part", async () => {
    signedIn();
    mockCommand("moodle_assignments", answer([]));
    open("course/4/assignments");
    expect(await screen.findByText("No assignments")).toBeTruthy();
  });
});

/// The banner picture, not the Moodle mark beside the welcome.
const BANNER = 'img:not([data-slot="moodle-icon"])';

describe("course banners", () => {
  it("shows the banner Moodle gives a course, as the picture the backend fetched", async () => {
    mockCommand("moodle_status", connected);
    mockCommand(
      "moodle_courses",
      answer([
        course({
          overviewFiles: [
            {
              kind: "file",
              fileName: "banner.jpg",
              filePath: "/",
              fileSize: 10,
              fileUrl: `${SITE}/pluginfile.php/1/banner.jpg`,
              timeModified: 3,
              mimeType: "image/jpeg",
            },
          ],
        }),
      ]),
    );
    mockCommand("moodle_image", "data:image/jpeg;base64,AAAA");
    const { container } = open();
    await waitFor(() =>
      expect(container.querySelector(BANNER)?.getAttribute("src")).toBe(
        "data:image/jpeg;base64,AAAA",
      ),
    );
    expect(callsOf("moodle_image")).toEqual([
      { url: `${SITE}/pluginfile.php/1/banner.jpg`, fileName: "banner.jpg", timeModified: 3 },
    ]);
  });

  it("gives a course without a banner colors of its own, and asks for no picture", async () => {
    mockCommand("moodle_status", connected);
    mockCommand("moodle_courses", answer([course()]));
    const { container } = open();
    await screen.findByRole("button", { name: /Maths 1/ });
    expect(container.querySelector(BANNER)).toBeNull();
    expect(callsOf("moodle_image")).toHaveLength(0);
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
