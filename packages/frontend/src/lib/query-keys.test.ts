import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { qk } from "./query-keys.ts";

type Key = readonly (string | number | null | undefined | string[])[];

/// Whether invalidating `prefix` also refreshes `key`, as React Query matches keys.
function isPrefix(prefix: Key, key: Key): boolean {
  return (
    prefix.length <= key.length &&
    prefix.every((part, i) => JSON.stringify(part) === JSON.stringify(key[i]))
  );
}

describe("qk", () => {
  it("nests entity keys from broad to narrow", () => {
    expect(isPrefix(qk.entities.root, qk.entities.all)).toBe(true);
    expect(isPrefix(qk.entities.root, qk.entities.bySpace("s1"))).toBe(true);
    expect(isPrefix(qk.entities.all, qk.entities.trash)).toBe(true);
    expect(isPrefix(qk.entities.bySpace("s1"), qk.entities.noteSummaries("s1"))).toBe(true);
    expect(isPrefix(qk.entities.bySpace("s1"), qk.entities.jotSummaries("s1"))).toBe(true);
  });

  it("keeps one Space's entity keys apart from another's", () => {
    expect(isPrefix(qk.entities.bySpace("s1"), qk.entities.noteSummaries("s2"))).toBe(false);
  });

  it("puts every per Space list under its module root", () => {
    const lists = [
      qk.labels,
      qk.tasks,
      qk.sessions,
      qk.calendarEntries,
      qk.assignments,
      qk.courses,
      qk.semesters,
      qk.exams,
      qk.studyBlocks,
      qk.decks,
      qk.bookmarks,
      qk.files,
      qk.views,
      qk.recipes,
    ];
    for (const list of lists) {
      expect(isPrefix(list.root, list.bySpace("s1"))).toBe(true);
      expect(list.bySpace("s1")).toEqual([...list.root, "s1"]);
    }
  });

  it("puts the cross Space lists of tasks, sessions and calendar entries under their root", () => {
    expect(isPrefix(qk.tasks.root, qk.tasks.all)).toBe(true);
    expect(isPrefix(qk.sessions.root, qk.sessions.all)).toBe(true);
    expect(isPrefix(qk.calendarEntries.root, qk.calendarEntries.all)).toBe(true);
  });

  it("keeps the cross Space assignment and exam lists apart from their root", () => {
    // Pinned: these are invalidated explicitly wherever they change.
    expect(isPrefix(qk.assignments.root, qk.assignments.all)).toBe(false);
    expect(isPrefix(qk.exams.root, qk.exams.all)).toBe(false);
  });

  it("keeps today's sessions apart from the sessions root", () => {
    expect(isPrefix(qk.sessions.root, qk.sessions.today)).toBe(false);
    expect(isPrefix(qk.sessions.today, qk.sessions.todayBetween("a", "b"))).toBe(true);
  });

  it("nests the narrower keys of other modules", () => {
    expect(isPrefix(qk.labels.root, qk.labels.forSpaces(["s1"]))).toBe(true);
    expect(isPrefix(qk.labels.ofEntityRoot, qk.labels.ofEntity("e1"))).toBe(true);
    expect(isPrefix(qk.entity.root, qk.entity.byId("e1"))).toBe(true);
    expect(isPrefix(qk.tasks.byIdRoot, qk.tasks.byId("t1"))).toBe(true);
    expect(isPrefix(qk.tasks.subtasksRoot, qk.tasks.subtasks("t1"))).toBe(true);
    expect(isPrefix(qk.tasks.subtaskProgressRoot, qk.tasks.subtaskProgress("t1"))).toBe(true);
    expect(isPrefix(qk.tasks.openDueOrOverdue, qk.tasks.openDueOrOverdueList)).toBe(true);
    expect(isPrefix(qk.jots.unrefined, qk.jots.unrefinedAll)).toBe(true);
    expect(isPrefix(qk.jots.unrefinedAll, qk.jots.unrefinedList(5))).toBe(true);
    expect(isPrefix(qk.files.officePdf, qk.files.officePdfOf("f1", null))).toBe(true);
    expect(
      isPrefix(qk.externalCalendars.events, qk.externalCalendars.eventsBetween("a", "b")),
    ).toBe(true);
    expect(isPrefix(qk.backups.root, qk.backups.inFolder("/tmp"))).toBe(true);
    expect(isPrefix(qk.views.root, qk.views.byModule("s1", "tasks"))).toBe(true);
  });

  it("builds the same key for the same arguments", () => {
    expect(qk.entity.byId("e1")).toEqual(qk.entity.byId("e1"));
    expect(qk.courses.grades("c1", 1, 2, 3)).toEqual(["course-grades", "c1", 1, 2, 3]);
  });

  it("refreshes nested queries when React Query invalidates a root", async () => {
    const client = new QueryClient();
    client.setQueryData(qk.entities.noteSummaries("s1"), ["note"]);
    client.setQueryData(qk.entities.noteSummaries("s2"), ["other"]);
    client.setQueryData(qk.calendarEntries.all, ["entry"]);
    await client.invalidateQueries({ queryKey: qk.entities.bySpace("s1") });
    await client.invalidateQueries({ queryKey: qk.calendarEntries.root });
    expect(client.getQueryState(qk.entities.noteSummaries("s1"))?.isInvalidated).toBe(true);
    expect(client.getQueryState(qk.entities.noteSummaries("s2"))?.isInvalidated).toBe(false);
    expect(client.getQueryState(qk.calendarEntries.all)?.isInvalidated).toBe(true);
  });
});
