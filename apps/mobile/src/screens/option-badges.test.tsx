import { describe, expect, it } from "@jest/globals";
import {
  courseOption,
  entityOption,
  examOption,
  labelOption,
  spaceOption,
  statusOption,
} from "./option-badges.tsx";

describe("picker badges (D50)", () => {
  it("tints a status's badge with the status's own colour", () => {
    const option = statusOption({
      id: "in_progress",
      name: "In Progress",
      color: "#3b82f6",
      doneness: 50,
      position: 2,
    });
    expect(option).toMatchObject({ id: "in_progress", label: "In Progress", tint: "#3b82f6" });
    expect(option.icon).toBeTruthy();
  });

  it("tints a label's badge with the label's colour", () => {
    const option = labelOption({ id: "l1", name: "Urgent", color: "#ef4444" });
    expect(option).toMatchObject({ id: "l1", label: "Urgent", tint: "#ef4444" });
  });

  it("tints a Space's badge with the Space's colour", () => {
    const option = spaceOption({
      id: "s1",
      name: "Study",
      color: "#22c55e",
      icon: null,
      position: 0,
    });
    expect(option).toMatchObject({ id: "s1", label: "Study", tint: "#22c55e" });
  });
});

describe("item badges (D51)", () => {
  const entity = {
    id: "e1",
    spaceId: "s1",
    type: "task",
    title: "Write essay",
    icon: null,
    pinned: false,
    createdAt: "",
    updatedAt: "",
    deletedAt: null,
    key: "TSK-14",
    lastOpenedAt: null,
  };

  it("shows an item with its module's tint and its key under the title", () => {
    expect(entityOption(entity)).toMatchObject({
      id: "e1",
      label: "Write essay",
      subtitle: "TSK-14",
      tint: "blue",
    });
  });

  it("calls an untitled item Untitled", () => {
    expect(entityOption({ ...entity, title: "" }).label).toBe("Untitled");
  });

  it("shows a course's professor and an exam's day", () => {
    const course = {
      entity: { ...entity, type: "course", title: "Algebra" },
      professor: "Noether",
      room: null,
    };
    expect(courseOption(course)).toMatchObject({
      label: "Algebra",
      subtitle: "Noether",
      tint: "purple",
    });
    const exam = {
      entity: { ...entity, type: "exam", title: "Final" },
      courseId: null,
      examDate: "2026-12-01",
      examTime: null,
      room: null,
      weight: null,
      grade: null,
      status: "upcoming",
    };
    expect(examOption(exam, "2026-11-13")).toMatchObject({ label: "Final", tint: "red" });
    expect(examOption(exam, "2026-11-13").detail).toMatch(/1/);
  });
});
