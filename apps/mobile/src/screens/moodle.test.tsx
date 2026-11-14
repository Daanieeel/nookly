import {
  createCourse,
  createSpace,
  entityLabels,
  fileWithOrigin,
  getFile,
} from "@nookly/shared/data";
import { router } from "expo-router";
import { act, fireEvent, waitFor } from "expo-router/testing-library";
import { View } from "react-native";
import { type MoodleAnswers, SITE, connected, fakeMoodle } from "../test/fake-moodle.tsx";
import { renderScreens, testData } from "../test/render.tsx";
import type { FileViewer } from "../ui/file-viewer.tsx";
import { moodleText } from "../moodle/format.ts";
import { MoodleModule } from "./MoodleScreens.tsx";
import {
  MoodleAssignmentScreen,
  MoodleCourseScreen,
  MoodleDiscussionScreen,
  MoodleForumScreen,
  MoodlePageScreen,
} from "./MoodleCourse.tsx";
import { MoodleFileScreen } from "./MoodleFile.tsx";

// This build's own viewer, standing in for the native one: what it was asked to show.
const standIn: FileViewer = {
  available: true,
  View: (props) => (
    <View accessibilityLabel={props.accessibilityLabel} testID={`viewer ${props.uri}`} />
  ),
  thumbnail: async () => null,
};

const SLIDES = {
  type: "file",
  filename: "lecture1.pdf",
  filesize: 2048,
  timemodified: 1_700_000_000,
  fileurl: `${SITE}/pluginfile.php/1/mod_resource/content/2/lecture1.pdf?forcedownload=1`,
};

const COURSE_CONTENTS: MoodleAnswers = {
  core_enrol_get_users_courses: [{ id: 1, shortname: "ALG", fullname: "Algorithms" }],
  core_course_get_contents: [
    {
      id: 10,
      name: "Week 1",
      summary: "<p>Intro &amp; setup</p>",
      modules: [
        { id: 100, name: "Lecture 1", modname: "resource", contents: [SLIDES] },
        { id: 101, name: "Sheet 1", modname: "assign" },
        { id: 102, name: "Announcements", modname: "forum" },
        {
          id: 103,
          name: "Reading",
          modname: "page",
          contents: [
            {
              type: "file",
              filename: "index.html",
              fileurl: `${SITE}/pluginfile.php/9/index.html`,
            },
          ],
        },
        { id: 104, name: "Quiz 1", modname: "quiz", url: `${SITE}/mod/quiz/view.php?id=104` },
      ],
    },
  ],
  mod_assign_get_assignments: {
    courses: [{ assignments: [{ id: 5, cmid: 101, name: "Sheet 1", duedate: 0 }] }],
  },
  mod_forum_get_forums_by_courses: [
    { id: 8, cmid: 102, name: "Announcements", type: "news", numdiscussions: 2 },
  ],
};

describe("Moodle on the phone", () => {
  it("signs in on the university's own page, in the system's sign in sheet", async () => {
    const moodle = fakeMoodle();
    const screen = await renderScreens(
      moodle.routes({ index: () => <MoodleModule />, "moodle-signin": () => null }),
      testData(),
    );
    expect(await screen.findByText("Connect your Moodle")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Moodle address"), "moodle.uni.edu");
    await fireEvent.press(screen.getByRole("button", { name: "Sign In with Moodle" }));
    await waitFor(() =>
      expect(moodle.sheet.opened).toEqual([
        "https://moodle.uni.edu/admin/tool/mobile/launch.php?service=moodle_mobile_app&passport=11111111222233334444555555555555&urlscheme=nookly",
      ]),
    );
    expect(moodle.opened).toEqual([]);
    expect(moodle.keys.get("moodle.pending")).toContain('"root":"https://moodle.uni.edu"');
    // Closing the sheet leaves the page as it was.
    expect(screen.getPathname()).toBe("/");
    // Moodle's link back comes straight out of the sheet and finishes the sign in.
    moodle.sheet.answer = "nookly://token=abc";
    await fireEvent.press(
      await screen.findByRole("button", { name: "Sign In with Moodle", busy: false }),
    );
    await waitFor(() => expect(screen.getPathname()).toBe("/moodle-signin"));
  });

  // As on the desktop: a white button with Moodle's own mark, the same in both themes.
  it("signs in with a Moodle branded button", async () => {
    const moodle = fakeMoodle();
    const screen = await renderScreens({ index: moodle.wrap(<MoodleModule />) }, testData());
    const button = await screen.findByRole("button", { name: "Sign In with Moodle" });
    expect(button).toHaveStyle({ backgroundColor: "#ffffff", borderColor: "#e2e2e2" });
    expect(screen.getByTestId("moodle-mark", { includeHiddenElements: true })).toBeTruthy();
  });

  it("lists the courses on now first, then the past ones, each with its colors and progress", async () => {
    const moodle = connected({
      core_enrol_get_users_courses: [
        { id: 2, shortname: "OLD", fullname: "Old Course", enddate: 1_000_000 },
        { id: 1, shortname: "ALG", fullname: "Algorithms", progress: 40 },
        { id: 3, shortname: "HID", fullname: "Hidden Course", hidden: true },
      ],
    });
    const screen = await renderScreens({ index: moodle.wrap(<MoodleModule />) }, testData());
    expect(await screen.findByText("Welcome back, Ada")).toBeTruthy();
    const now = await screen.findByRole("button", { name: "Algorithms, ALG · 40% done" });
    const past = screen.getByRole("button", { name: "Old Course, OLD" });
    expect(screen.getByText("NOW")).toBeTruthy();
    expect(screen.getByText("PAST COURSES")).toBeTruthy();
    const order = screen.getAllByRole("button").map((b) => b.props.accessibilityLabel);
    expect(order.indexOf(now.props.accessibilityLabel)).toBeLessThan(
      order.indexOf(past.props.accessibilityLabel),
    );
    expect(screen.queryByText("Hidden Course")).toBeNull();
    expect(screen.getAllByTestId("course-art", { includeHiddenElements: true })).toHaveLength(2);
  });

  it("opens every page of the module on the Moodle website too", async () => {
    const moodle = connected(COURSE_CONTENTS);
    const screen = await renderScreens({ index: moodle.wrap(<MoodleModule />) }, testData());
    await fireEvent.press(await screen.findByRole("button", { name: "Open in Moodle" }));
    expect(moodle.opened).toEqual([`${SITE}/my/courses.php`]);
    const course = await renderScreens(
      { index: moodle.wrap(<MoodleCourseScreen courseId={1} spaceId="s" />) },
      testData(),
    );
    await fireEvent.press(await course.findByRole("button", { name: "Open in Moodle" }));
    await fireEvent.press(course.getByRole("tab", { name: "Grades" }));
    await fireEvent.press(course.getByRole("button", { name: "Open in Moodle" }));
    expect(moodle.opened.slice(1)).toEqual([
      `${SITE}/course/view.php?id=1`,
      `${SITE}/grade/report/user/index.php?id=1`,
    ]);
  });

  it("reads what it showed last time while Moodle is out of reach, and says so", async () => {
    const moodle = connected({
      core_enrol_get_users_courses: [{ id: 1, shortname: "ALG", fullname: "Algorithms" }],
    });
    const first = await renderScreens({ index: moodle.wrap(<MoodleModule />) }, testData());
    expect(await first.findByText("Algorithms")).toBeTruthy();
    expect(first.queryByText(/^Offline/)).toBeNull();
    first.unmount();
    moodle.state.online = false;
    const again = await renderScreens({ index: moodle.wrap(<MoodleModule />) }, testData());
    expect(await again.findByText("Algorithms")).toBeTruthy();
    expect(again.getByText("Offline, showing what Nookly read last time")).toBeTruthy();
  });

  it("says plainly when Moodle can't be reached and nothing was read before", async () => {
    const moodle = connected();
    moodle.state.online = false;
    const screen = await renderScreens({ index: moodle.wrap(<MoodleModule />) }, testData());
    expect(await screen.findByText("Can't reach Moodle")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try Again" })).toBeTruthy();
  });

  it("asks to connect again when the sign in ran out", async () => {
    const moodle = connected({
      core_enrol_get_users_courses: {
        exception: "moodle_exception",
        errorcode: "invalidtoken",
        message: "Invalid token",
      },
    });
    const screen = await renderScreens({ index: moodle.wrap(<MoodleModule />) }, testData());
    expect(await screen.findByText("Your sign in ran out")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Connect Again" }));
    expect(await screen.findByText("Connect your Moodle")).toBeTruthy();
    expect(moodle.keys.has("moodle.connection")).toBe(false);
  });

  it("signs out, forgetting the sign in and every answer kept on this phone", async () => {
    const moodle = connected({
      core_enrol_get_users_courses: [{ id: 1, shortname: "ALG", fullname: "Algorithms" }],
    });
    const screen = await renderScreens({ index: moodle.wrap(<MoodleModule />) }, testData());
    expect(await screen.findByText("Algorithms")).toBeTruthy();
    expect(moodle.kept.size).toBeGreaterThan(0);
    await fireEvent.press(screen.getByRole("button", { name: "Sign Out" }));
    expect(await screen.findByText("Connect your Moodle")).toBeTruthy();
    expect(moodle.keys.has("moodle.connection")).toBe(false);
    expect(moodle.kept.size).toBe(0);
  });

  it("shows a course's sections, and each item opens where it is read", async () => {
    const moodle = connected(COURSE_CONTENTS, {
      [`${SITE}/webservice/pluginfile.php/9/index.html`]: "<h2>Read me</h2><p>Hello</p>",
    });
    const screen = await renderScreens(
      moodle.routes({
        index: () => <MoodleCourseScreen courseId={1} spaceId="s" />,
        "moodle/file": () => <MoodleFileScreen courseId={1} cmid={100} index={0} spaceId="s" />,
        "moodle/assignment/[id]": () => <MoodleAssignmentScreen courseId={1} assignmentId={5} />,
        "moodle/forum/[id]": () => <MoodleForumScreen courseId={1} forumId={8} spaceId="s" />,
        "moodle/page/[cmid]": () => <MoodlePageScreen courseId={1} cmid={103} />,
      }),
      testData(),
      "/",
      { fileViewer: standIn },
    );
    expect(await screen.findByText("Intro & setup")).toBeTruthy();
    expect(
      await screen.findByRole("button", { name: "Sheet 1, Assignment · No due date" }),
    ).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", { name: "Lecture 1, PDF · 2 KB · lecture1.pdf" }),
    );
    await waitFor(() => expect(screen.getPathname()).toBe("/moodle/file"));
    act(() => router.back());
    await fireEvent.press(
      await screen.findByRole("button", { name: "Sheet 1, Assignment · No due date" }),
    );
    await waitFor(() => expect(screen.getPathname()).toBe("/moodle/assignment/5"));
    act(() => router.back());
    await fireEvent.press(
      await screen.findByRole("button", { name: "Announcements, Announcements · 2 discussions" }),
    );
    await waitFor(() => expect(screen.getPathname()).toBe("/moodle/forum/8"));
    act(() => router.back());
    await fireEvent.press(await screen.findByRole("button", { name: "Reading, Page" }));
    await waitFor(() => expect(screen.getPathname()).toBe("/moodle/page/103"));
    act(() => router.back());
    // What Nookly can't read opens on Moodle.
    await fireEvent.press(await screen.findByRole("button", { name: "Quiz 1, Quiz" }));
    expect(moodle.opened).toEqual([`${SITE}/mod/quiz/view.php?id=104`]);
  });

  it("reads a Moodle page in Nookly, images by their description", async () => {
    const moodle = connected(COURSE_CONTENTS, {
      [`${SITE}/webservice/pluginfile.php/9/index.html`]:
        '<h2>Read me</h2><p>Hello <img src="x.png" alt="a diagram"> world</p><ul><li>One</li></ul>',
    });
    const screen = await renderScreens(
      { index: moodle.wrap(<MoodlePageScreen courseId={1} cmid={103} />) },
      testData(),
    );
    expect(
      await screen.findByText("Hello [a diagram] world\n\n• One", { exact: false }),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Open in Moodle" }));
    expect(moodle.opened).toEqual([`${SITE}/mod/page/view.php?id=103`]);
  });

  it("shows an assignment: what it asks, where the hand in stands, the grade and feedback", async () => {
    const moodle = connected({
      mod_assign_get_assignments: {
        courses: [
          {
            assignments: [
              {
                id: 5,
                cmid: 101,
                name: "Sheet 1",
                duedate: 1_700_000_000,
                intro: "<p>Solve all tasks.</p>",
                introattachments: [{ ...SLIDES, filename: "sheet1.pdf" }],
              },
            ],
          },
        ],
      },
      mod_assign_get_submission_status: {
        lastattempt: { submission: { status: "submitted" }, gradingstatus: "graded" },
        feedback: {
          gradefordisplay: "9.00 / 10.00",
          plugins: [{ editorfields: [{ text: "<p>Well done</p>" }] }],
        },
      },
    });
    const screen = await renderScreens(
      { index: moodle.wrap(<MoodleAssignmentScreen courseId={1} assignmentId={5} />) },
      testData(),
    );
    expect(await screen.findByText("Solve all tasks.")).toBeTruthy();
    expect(await screen.findByText("Submitted")).toBeTruthy();
    expect(screen.getByText("Graded")).toBeTruthy();
    expect(screen.getByText("9.00 / 10.00")).toBeTruthy();
    expect(screen.getByText("Well done")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^sheet1\.pdf, PDF/ })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Open in Moodle" }));
    expect(moodle.opened).toEqual([`${SITE}/mod/assign/view.php?id=101`]);
  });

  it("shows each grade with its percentage, weight and feedback, the course total last", async () => {
    const moodle = connected({
      gradereport_user_get_grade_items: {
        usergrades: [
          {
            gradeitems: [
              {
                id: 1,
                itemtype: "course",
                gradeformatted: "85.00",
                percentageformatted: "85.00 %",
              },
              {
                id: 3,
                itemname: "Sheet 1",
                itemtype: "mod",
                gradeformatted: "9.00",
                rangeformatted: "0–10",
                percentageformatted: "90.00 %",
                weightformatted: "50.00 %",
                feedback: "<p>Nice</p>",
              },
            ],
          },
        ],
      },
    });
    const screen = await renderScreens(
      { index: moodle.wrap(<MoodleCourseScreen courseId={1} spaceId="s" />) },
      testData(),
    );
    await fireEvent.press(await screen.findByRole("tab", { name: "Grades" }));
    expect(await screen.findByText("9.00")).toBeTruthy();
    expect(screen.getByText("90.00 % · Weight 50.00 % · Out of 0–10")).toBeTruthy();
    expect(screen.getByText("Nice")).toBeTruthy();
    const titles = screen.getAllByTestId("grade-title").map((t) => t.props.children);
    expect(titles).toEqual(["Sheet 1", "Course total"]);
  });

  it("lists the announcements first, and reads a discussion with who wrote each post", async () => {
    const moodle = connected({
      mod_forum_get_forums_by_courses: [
        { id: 9, cmid: 109, name: "Questions", type: "general", numdiscussions: 0 },
        { id: 8, cmid: 102, name: "News", type: "news", numdiscussions: 1 },
      ],
      mod_forum_get_forum_discussions: {
        discussions: [
          { discussion: 30, name: "Exam date", userfullname: "Grace Hopper", pinned: true },
        ],
      },
      mod_forum_get_discussion_posts: {
        posts: [
          {
            id: 1,
            subject: "Exam date",
            message: "<p>It is on Friday.</p>",
            author: { fullname: "Grace Hopper" },
            attachments: [{ ...SLIDES, filename: "room.pdf" }],
          },
        ],
      },
    });
    const course = await renderScreens(
      { index: moodle.wrap(<MoodleCourseScreen courseId={1} spaceId="s" />) },
      testData(),
    );
    await fireEvent.press(await course.findByRole("tab", { name: "Forums" }));
    const rows = await course.findAllByRole("button", { name: /discussion/ });
    expect(rows.map((r) => r.props.accessibilityLabel)).toEqual([
      "News, Announcements · 1 discussion",
      "Questions, Forum · 0 discussions",
    ]);
    const forum = await renderScreens(
      { index: moodle.wrap(<MoodleForumScreen courseId={1} forumId={8} spaceId="s" />) },
      testData(),
    );
    expect(
      await forum.findByRole("button", { name: /^Exam date, Pinned · Grace Hopper/ }),
    ).toBeTruthy();
    const discussion = await renderScreens(
      { index: moodle.wrap(<MoodleDiscussionScreen discussionId={30} />) },
      testData(),
    );
    expect(await discussion.findByText("It is on Friday.")).toBeTruthy();
    expect(discussion.getByText("GH", { includeHiddenElements: true })).toBeTruthy();
    expect(discussion.getByRole("button", { name: /^room\.pdf, PDF/ })).toBeTruthy();
    await fireEvent.press(discussion.getByRole("button", { name: "Open in Moodle" }));
    expect(moodle.opened).toEqual([`${SITE}/mod/forum/discuss.php?d=30`]);
  });

  it("reads a course file in Nookly, downloading it once with the sign in", async () => {
    const moodle = connected(COURSE_CONTENTS);
    const screen = await renderScreens(
      { index: moodle.wrap(<MoodleFileScreen courseId={1} cmid={100} index={0} spaceId="s" />) },
      testData(),
      "/",
      { fileViewer: standIn },
    );
    expect(await screen.findByTestId("viewer file:///moodle-files/lecture1.pdf")).toBeTruthy();
    expect(moodle.downloaded).toEqual([
      `${SITE}/webservice/pluginfile.php/1/mod_resource/content/2/lecture1.pdf?forcedownload=1&token=abc123`,
    ]);
    await fireEvent.press(screen.getByRole("button", { name: "Open in Moodle" }));
    expect(moodle.opened).toEqual([`${SITE}/mod/resource/view.php?id=100`]);
  });

  it("imports a course file named, labelled and attached to its course, then shows it", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const course = await createCourse(data.db, space, "Algorithms");
    const moodle = connected(COURSE_CONTENTS);
    const screen = await renderScreens(
      moodle.routes({
        index: () => <MoodleFileScreen courseId={1} cmid={100} index={0} spaceId={space} />,
        "entity/[id]": () => null,
      }),
      data,
      "/",
      { fileViewer: standIn },
    );
    await fireEvent.press(await screen.findByRole("button", { name: "Import to Nookly" }));
    expect(await screen.findByDisplayValue("Lecture 1.pdf")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Labels, ALG, Week 1" })).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Course, Algorithms" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Import" }));
    const origin = `moodle:${SITE}/pluginfile.php/1/mod_resource/content/2/lecture1.pdf`;
    await waitFor(async () => expect(await fileWithOrigin(data.db, origin)).not.toBeNull());
    const id = (await fileWithOrigin(data.db, origin))!;
    const file = await getFile(data.db, id);
    expect(file?.entity.title).toBe("Lecture 1.pdf");
    expect(file?.localPath).toBe("file:///files/lecture1.pdf");
    expect((await entityLabels(data.db, id)).map((l) => l.name)).toEqual(["ALG", "Week 1"]);
    expect(
      data.driver.rows(
        "SELECT from_entity_id FROM relationships WHERE to_entity_id = ? AND relationship_type = 'attached-file'",
        id,
      ),
    ).toEqual([{ from_entity_id: course }]);
    await fireEvent.press(await screen.findByRole("button", { name: "Show in Nookly" }));
    await waitFor(() => expect(screen.getPathname()).toBe(`/entity/${id}`));
  });

  it("reads Moodle's HTML as text, images by their description", () => {
    expect(moodleText("<p>One</p><p>Two&nbsp;&lt;3</p>")).toBe("One\n\nTwo <3");
    expect(moodleText('<p>See <img alt="chart"> and <img src="y"></p>')).toBe("See [chart] and");
    expect(moodleText("<ol><li>A</li><li>B</li></ol>")).toBe("• A\n• B");
    expect(moodleText("<p><br></p>")).toBe("");
  });
});
