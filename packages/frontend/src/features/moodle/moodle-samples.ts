import type {
  MoodleAssignment,
  MoodleCourse,
  MoodleDiscussion,
  MoodleForum,
  MoodleGradeItem,
  MoodlePost,
  MoodleSection,
} from "#/lib/api/moodle.ts";

/// Stand ins for what Moodle will answer, so a loading page can be drawn in the shape of the
/// real one (see `MoodleData`). Nothing here is shown as content.
const PLAIN = "Lorem ipsum dolor sit amet";

export const SAMPLE_COURSES: MoodleCourse[] = [1, 2, 3, 4].map((id) => ({
  id,
  shortName: "COURSE 101",
  fullName: "A course with a name of some length",
  summary: "",
  startDate: 1,
  endDate: 0,
  progress: 40,
  hidden: false,
  overviewFiles: [],
}));

export const SAMPLE_SECTIONS: MoodleSection[] = [1, 2].map((id) => ({
  id,
  name: "A section of the course",
  summary: "",
  modules: [1, 2, 3].map((n) => ({
    id: id * 10 + n,
    name: "A file or a link of the course",
    modName: "resource",
    url: "",
    description: "",
    contents: [],
  })),
}));

export const SAMPLE_ASSIGNMENTS: MoodleAssignment[] = [1, 2, 3].map((id) => ({
  id,
  cmid: id,
  name: "An assignment with a name",
  dueDate: 1,
  openDate: 0,
  cutOffDate: 0,
  intro: "",
  attachments: [],
}));

export const SAMPLE_GRADES: MoodleGradeItem[] = [1, 2, 3, 4].map((id) => ({
  id,
  name: "A graded item",
  itemType: "mod",
  itemModule: null,
  cmid: null,
  grade: "1,0",
  range: "0 to 100",
  percentage: "80 %",
  weight: "25 %",
  feedback: null,
}));

export const SAMPLE_FORUMS: MoodleForum[] = [1, 2, 3].map((id) => ({
  id,
  cmid: id,
  name: "A forum of the course",
  kind: "general",
  intro: "",
  numDiscussions: 12,
}));

export const SAMPLE_DISCUSSIONS: MoodleDiscussion[] = [1, 2, 3, 4].map((id) => ({
  discussionId: id,
  name: PLAIN,
  subject: PLAIN,
  message: "",
  author: "Someone Teaching",
  timeModified: 1,
  numReplies: 3,
  pinned: false,
  attachments: [],
}));

export const SAMPLE_POSTS: MoodlePost[] = [1, 2].map((id) => ({
  id,
  parentId: 0,
  subject: PLAIN,
  message: `<p>${PLAIN}, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>`,
  author: { fullName: "Someone Teaching" },
  timeCreated: 1,
  attachments: [],
}));
