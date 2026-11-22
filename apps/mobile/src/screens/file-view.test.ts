import { UNLABELLED } from "@nookly/shared/label-shelf";
import {
  FILE_DEFAULT,
  fileDisplayFromView,
  fileDisplaySchema,
  fileViewConfig,
} from "./file-view.ts";

// D74: a Files View saved on either app opens the same on the other.
describe("Files views", () => {
  it("reads a View the desktop saved: its filters, its display and its shelf", () => {
    const raw = JSON.stringify({
      filters: [
        { fieldId: "kind", operator: "is", values: ["pdf"] },
        { fieldId: "labels", operator: "is", values: ["l1"] },
        { fieldId: "pinned", operator: "is", values: ["pinned"] },
        { fieldId: "created", operator: "is", values: ["week"] },
      ],
      display: { layout: "list", grouping: "label", ordering: "name", shelf: ["l2"] },
    });
    expect(fileDisplayFromView(raw, { labelIds: ["l1", "l2"] })).toEqual({
      display: {
        ...FILE_DEFAULT,
        layout: "list",
        grouping: "label",
        ordering: "name",
        kinds: ["pdf"],
        labels: ["l1"],
        pinned: ["pinned"],
        created: ["week"],
        shelf: ["l2"],
      },
      ignored: [],
    });
  });

  it("reads an excluding filter as everything else, and names what it can't show", () => {
    const raw = JSON.stringify({
      filters: [
        { fieldId: "labels", operator: "isNot", values: ["l1"] },
        { fieldId: "size", operator: "is", values: ["big"] },
      ],
      display: { grouping: "site" },
    });
    expect(fileDisplayFromView(raw, { labelIds: ["l1", "l2"] })).toEqual({
      display: { ...FILE_DEFAULT, labels: ["l2"] },
      ignored: ["size", "grouping by site"],
    });
  });

  it("reads anything unreadable as the plain page", () => {
    expect(fileDisplayFromView("garbage", { labelIds: [] })).toEqual({
      display: FILE_DEFAULT,
      ignored: [],
    });
  });

  it("writes what the desktop reads, and reads it back the same", () => {
    const display = {
      ...FILE_DEFAULT,
      grouping: "kind" as const,
      kinds: ["image"],
      updated: ["today"],
      shelf: [UNLABELLED],
    };
    const raw = fileViewConfig(display);
    expect(JSON.parse(raw)).toEqual({
      filters: [
        { fieldId: "kind", operator: "is", values: ["image"] },
        { fieldId: "updated", operator: "is", values: ["today"] },
      ],
      display: { layout: "grid", grouping: "kind", ordering: "newest", shelf: [UNLABELLED] },
    });
    expect(fileDisplayFromView(raw, { labelIds: [] }).display).toEqual(display);
  });

  it("keeps a display saved before the shelf and the label grouping", () => {
    const stored = { layout: "grid", grouping: "kind", ordering: "name", kinds: [], labels: [] };
    expect(fileDisplaySchema.parse(stored)).toEqual({ ...FILE_DEFAULT, ...stored });
  });
});

// The desktop's Files page searches, files by course and keeps the search in a View.
describe("Files views with a search, courses and unsorted files", () => {
  it("reads the search text, the course and attached filters, and unsorted", () => {
    const raw = JSON.stringify({
      query: "fourier",
      filters: [
        { fieldId: "course", operator: "is", values: ["c1"] },
        { fieldId: "attached", operator: "is", values: ["a1"] },
        { fieldId: "filing", operator: "is", values: ["unsorted"] },
      ],
      display: { grouping: "course" },
    });
    expect(fileDisplayFromView(raw, { labelIds: [] })).toEqual({
      display: {
        ...FILE_DEFAULT,
        courses: ["c1"],
        attached: ["a1"],
        unsorted: true,
        grouping: "course",
      },
      query: "fourier",
      ignored: [],
    });
  });

  it("names a filing filter it can't show", () => {
    const raw = JSON.stringify({
      filters: [{ fieldId: "filing", operator: "is", values: ["sorted"] }],
    });
    expect(fileDisplayFromView(raw, { labelIds: [] }).ignored).toEqual(["filing"]);
  });

  it("writes them for the desktop, and reads them back the same", () => {
    const display = {
      ...FILE_DEFAULT,
      courses: ["c1"],
      attached: ["a1"],
      unsorted: true,
      grouping: "attached" as const,
    };
    const raw = fileViewConfig(display, "fourier");
    expect(JSON.parse(raw)).toMatchObject({
      query: "fourier",
      filters: [
        { fieldId: "course", operator: "is", values: ["c1"] },
        { fieldId: "attached", operator: "is", values: ["a1"] },
        { fieldId: "filing", operator: "is", values: ["unsorted"] },
      ],
    });
    expect(fileDisplayFromView(raw, { labelIds: [] })).toMatchObject({ display, query: "fourier" });
  });

  it("leaves the query out when there is none", () => {
    expect(JSON.parse(fileViewConfig(FILE_DEFAULT))).not.toHaveProperty("query");
  });
});
