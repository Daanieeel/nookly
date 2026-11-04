import { describe, expect, it } from "vitest";
import {
  assignmentPath,
  coursePath,
  discussionPath,
  filePath,
  forumPath,
  moodleWebUrl,
  pagePath,
  parseMoodlePath,
} from "./moodle-path.ts";

describe("moodle paths", () => {
  it("starts at the course list", () => {
    for (const path of [undefined, "", "course", "course/x", "course/0", "course/-3", "nope/4"]) {
      expect(parseMoodlePath(path)).toEqual({ page: "courses" });
    }
  });

  it("reads a course and its tabs, defaulting to the contents", () => {
    expect(parseMoodlePath("course/4")).toEqual({ page: "course", courseId: 4, tab: "contents" });
    expect(parseMoodlePath("course/4/grades")).toEqual({
      page: "course",
      courseId: 4,
      tab: "grades",
    });
    expect(parseMoodlePath("course/4/whatever")).toEqual({
      page: "course",
      courseId: 4,
      tab: "contents",
    });
  });

  it("reads the pages inside a course", () => {
    expect(parseMoodlePath(assignmentPath(4, 3))).toEqual({
      page: "assignment",
      courseId: 4,
      assignmentId: 3,
    });
    expect(parseMoodlePath(forumPath(4, 2))).toEqual({ page: "forum", courseId: 4, forumId: 2 });
    expect(parseMoodlePath(discussionPath(4, 2, 9))).toEqual({
      page: "discussion",
      courseId: 4,
      forumId: 2,
      discussionId: 9,
    });
    expect(parseMoodlePath(pagePath(4, 30))).toEqual({
      page: "section-page",
      courseId: 4,
      cmid: 30,
    });
  });

  it("a pageless or broken id falls back to the course", () => {
    expect(parseMoodlePath("course/4/assignments")).toEqual({
      page: "course",
      courseId: 4,
      tab: "assignments",
    });
    expect(parseMoodlePath("course/4/assignments/zero")).toMatchObject({ page: "course" });
    expect(parseMoodlePath("course/4/forums/2/x")).toMatchObject({ page: "forum", forumId: 2 });
  });

  it("writes the paths it reads", () => {
    expect(coursePath(4)).toBe("course/4");
    expect(coursePath(4, "forums")).toBe("course/4/forums");
    for (const location of [
      parseMoodlePath(coursePath(4, "assignments")),
      parseMoodlePath(discussionPath(1, 2, 3)),
    ]) {
      expect(location.page).toBeTruthy();
    }
  });

  it("links every page to the same page on Moodle", () => {
    const site = "https://uni.edu/moodle/";
    expect(moodleWebUrl(site, { page: "courses" })).toBe("https://uni.edu/moodle/my/courses.php");
    expect(moodleWebUrl(site, parseMoodlePath("course/4"))).toBe(
      "https://uni.edu/moodle/course/view.php?id=4",
    );
    expect(moodleWebUrl(site, parseMoodlePath("course/4/grades"))).toBe(
      "https://uni.edu/moodle/grade/report/user/index.php?id=4",
    );
    expect(moodleWebUrl(site, parseMoodlePath("course/4/assignments/3"), 30)).toBe(
      "https://uni.edu/moodle/mod/assign/view.php?id=30",
    );
    expect(moodleWebUrl(site, parseMoodlePath("course/4/forums/2"), 50)).toBe(
      "https://uni.edu/moodle/mod/forum/view.php?id=50",
    );
    expect(moodleWebUrl(site, parseMoodlePath("course/4/forums/2/9"))).toBe(
      "https://uni.edu/moodle/mod/forum/discuss.php?d=9",
    );
    expect(moodleWebUrl(site, parseMoodlePath("course/4/page/30"))).toBe(
      "https://uni.edu/moodle/mod/page/view.php?id=30",
    );
  });

  it("names a file of a course item by the item and the file's place in it", () => {
    expect(filePath(4, 12, 0)).toBe("course/4/file/12/0");
    expect(parseMoodlePath("course/4/file/12/0")).toEqual({
      page: "file",
      courseId: 4,
      cmid: 12,
      index: 0,
    });
    expect(parseMoodlePath("course/4/file/12/3")).toEqual({
      page: "file",
      courseId: 4,
      cmid: 12,
      index: 3,
    });
    // Without an item, or with a place that is no number, it is the course.
    for (const path of [
      "course/4/file",
      "course/4/file/12",
      "course/4/file/12/x",
      "course/4/file/12/-1",
    ]) {
      expect(parseMoodlePath(path)).toEqual({ page: "course", courseId: 4, tab: "contents" });
    }
  });

  it("links a file to its item on the website", () => {
    expect(moodleWebUrl("https://m.edu/", { page: "file", courseId: 4, cmid: 12, index: 0 })).toBe(
      "https://m.edu/mod/resource/view.php?id=12",
    );
  });
});
