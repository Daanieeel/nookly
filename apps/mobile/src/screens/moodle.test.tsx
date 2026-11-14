import type { ReactNode } from "react";
import { fireEvent, waitFor } from "expo-router/testing-library";
import type {
  Http,
  MoodleAssignment,
  MoodleCourse,
  MoodleGradeItem,
  MoodleModule as Module,
  MoodleSection,
  RemoteFile,
} from "../moodle/api.ts";
import { MoodleProvider, moodleService } from "../moodle/service.tsx";
import { renderScreens, testData } from "../test/render.tsx";
import { MoodleCourseScreen, MoodleModule, plainText } from "./MoodleScreens.tsx";

const CONNECTION = {
  site: { root: "https://moodle.uni.edu" },
  token: "abc123",
  userId: 7,
  siteName: "Uni Moodle",
  fullName: "Ada Lovelace",
};

/// A Moodle site that answers each function with what a test gives it, a keychain in memory
/// and a browser that only records what it was asked to open.
/// What the fake site answers, by function: Moodle's own shapes, with fields left out.
interface MoodleAnswers {
  core_enrol_get_users_courses?: Partial<MoodleCourse>[];
  core_course_get_contents?: (Partial<Omit<MoodleSection, "modules">> & {
    modules: (Partial<Omit<Module, "contents">> & { contents?: Partial<RemoteFile>[] })[];
  })[];
  mod_assign_get_assignments?: { courses: { assignments: Partial<MoodleAssignment>[] }[] };
  gradereport_user_get_grade_items?: { usergrades: { gradeitems: Partial<MoodleGradeItem>[] }[] };
}

function fakeMoodle(answers: MoodleAnswers = {}) {
  const byFunction = new Map<string, object>(Object.entries(answers));
  const keys = new Map<string, string>();
  const opened: string[] = [];
  const http: Http = async (_url, init) => {
    const fn = new URLSearchParams(init.body).get("wsfunction") ?? "";
    return { ok: true, status: 200, json: async () => byFunction.get(fn) ?? [] };
  };
  const service = moodleService({
    http,
    keys: {
      getItemAsync: async (key) => keys.get(key) ?? null,
      setItemAsync: async (key, value) => void keys.set(key, value),
      deleteItemAsync: async (key) => void keys.delete(key),
    },
    md5: async () => "",
    uuid: () => "11111111-2222-3333-4444-555555555555",
    open: async (url) => void opened.push(url),
  });
  const wrap = (node: ReactNode) => () => <MoodleProvider service={service}>{node}</MoodleProvider>;
  return { keys, opened, wrap };
}

const connected = (answers: MoodleAnswers = {}) => {
  const moodle = fakeMoodle(answers);
  moodle.keys.set("moodle.connection", JSON.stringify(CONNECTION));
  return moodle;
};

describe("Moodle on the phone", () => {
  it("opens the university's own sign in page for the address typed", async () => {
    const moodle = fakeMoodle();
    const screen = await renderScreens({ index: moodle.wrap(<MoodleModule />) }, testData());
    expect(await screen.findByText("Connect your Moodle")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Moodle address"), "moodle.uni.edu");
    await fireEvent.press(screen.getByRole("button", { name: "Sign In with Moodle" }));
    await waitFor(() =>
      expect(moodle.opened).toEqual([
        "https://moodle.uni.edu/admin/tool/mobile/launch.php?service=moodle_mobile_app&passport=11111111222233334444555555555555&urlscheme=nookly",
      ]),
    );
    expect(moodle.keys.get("moodle.pending")).toContain('"root":"https://moodle.uni.edu"');
  });

  // As on the desktop: a white button with Moodle's own mark, the same in both themes.
  it("signs in with a Moodle branded button", async () => {
    const moodle = fakeMoodle();
    const screen = await renderScreens({ index: moodle.wrap(<MoodleModule />) }, testData());
    const button = await screen.findByRole("button", { name: "Sign In with Moodle" });
    expect(button).toHaveStyle({ backgroundColor: "#ffffff", borderColor: "#e2e2e2" });
    expect(screen.getByTestId("moodle-mark", { includeHiddenElements: true })).toBeTruthy();
  });

  it("lists the courses once connected, leaving out hidden ones", async () => {
    const moodle = connected({
      core_enrol_get_users_courses: [
        { id: 1, shortname: "ALG", fullname: "Algorithms", progress: 40 },
        { id: 2, shortname: "OLD", fullname: "Old Course", hidden: true },
      ],
    });
    const screen = await renderScreens({ index: moodle.wrap(<MoodleModule />) }, testData());
    expect(await screen.findByRole("button", { name: "Algorithms, ALG · 40% done" })).toBeTruthy();
    expect(screen.queryByText("Old Course")).toBeNull();
    expect(screen.getByText("Ada Lovelace on Uni Moodle")).toBeTruthy();
  });

  it("disconnects, forgetting the sign in on this phone", async () => {
    const moodle = connected();
    const screen = await renderScreens({ index: moodle.wrap(<MoodleModule />) }, testData());
    await fireEvent.press(await screen.findByRole("button", { name: "Disconnect Moodle" }));
    expect(await screen.findByText("Connect your Moodle")).toBeTruthy();
    expect(moodle.keys.has("moodle.connection")).toBe(false);
  });

  it("shows a course's contents, assignments and grades", async () => {
    const moodle = connected({
      core_course_get_contents: [
        {
          id: 10,
          name: "Week 1",
          summary: "<p>Intro &amp; setup</p>",
          modules: [
            {
              id: 100,
              name: "Slides",
              modname: "resource",
              url: "https://moodle.uni.edu/mod/resource/view.php?id=100",
              contents: [
                {
                  type: "file",
                  filename: "slides.pdf",
                  fileurl: "https://moodle.uni.edu/pluginfile.php/1/slides.pdf",
                },
              ],
            },
          ],
        },
      ],
      mod_assign_get_assignments: {
        courses: [{ assignments: [{ id: 5, cmid: 50, name: "Sheet 1", duedate: 0 }] }],
      },
      gradereport_user_get_grade_items: {
        usergrades: [
          {
            gradeitems: [
              {
                id: 3,
                itemname: "Sheet 1",
                itemtype: "mod",
                gradeformatted: "9.00",
                rangeformatted: "10",
              },
            ],
          },
        ],
      },
    });
    const screen = await renderScreens(
      { index: moodle.wrap(<MoodleCourseScreen courseId={1} />) },
      testData(),
    );
    expect(await screen.findByText("Intro & setup")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Slides, slides.pdf" }));
    expect(moodle.opened).toEqual([
      "https://moodle.uni.edu/webservice/pluginfile.php/1/slides.pdf?token=abc123",
    ]);
    await fireEvent.press(screen.getByRole("tab", { name: "Assignments" }));
    expect(await screen.findByRole("button", { name: "Sheet 1, No due date" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("tab", { name: "Grades" }));
    expect(await screen.findByText("9.00")).toBeTruthy();
  });

  it("reads Moodle's HTML as text", () => {
    expect(plainText("<p>One</p><p>Two&nbsp;&lt;3</p>")).toBe("One\nTwo <3");
  });
});
