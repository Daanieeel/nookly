import { describe, expect, it } from "vitest";
import {
  combinedText,
  describeConflict,
  diffWords,
  isTextValue,
  mergeConflictLists,
} from "./conflict-view.ts";
import { NodeSqliteDriver } from "./testing/node-driver.ts";

describe("diffWords", () => {
  it("marks what each side added and keeps what they share", () => {
    const { left, right } = diffWords("Buy oat milk", "Buy milk and eggs");
    expect(left.map((s) => [s.text, s.changed])).toEqual([
      ["Buy ", false],
      ["oat", true],
      [" milk", false],
    ]);
    expect(right.map((s) => [s.text, s.changed])).toEqual([
      ["Buy milk ", false],
      ["and eggs", true],
    ]);
  });

  it("joins back into exactly the original text on each side", () => {
    const a = "one two\nthree  four";
    const b = "one 2 three four five";
    const { left, right } = diffWords(a, b);
    expect(left.map((s) => s.text).join("")).toBe(a);
    expect(right.map((s) => s.text).join("")).toBe(b);
  });

  it("calls identical text unchanged and handles empty sides", () => {
    expect(diffWords("same", "same").left.every((s) => !s.changed)).toBe(true);
    expect(diffWords("", "new").right).toEqual([{ text: "new", changed: true }]);
    expect(diffWords("", "")).toEqual({ left: [], right: [] });
  });
});

describe("combining both versions", () => {
  it("puts the current text first, then the other, so nothing is typed twice", () => {
    expect(combinedText("Buy oat milk", "Buy milk and eggs", "title")).toBe(
      "Buy oat milk / Buy milk and eggs",
    );
    expect(combinedText("First idea", "Second idea", "content")).toBe("First idea\n\nSecond idea");
    expect(combinedText("same", "same", "title")).toBe("same");
    expect(combinedText("", "only other", "content")).toBe("only other");
  });

  it("knows which values are text", () => {
    expect(isTextValue("a")).toBe(true);
    expect(isTextValue(3)).toBe(false);
    expect(isTextValue(null)).toBe(false);
  });
});

const now = () => new Date().toISOString();

describe("describing a conflict", () => {
  it("names the item, the field and who made each side", async () => {
    const d = new NodeSqliteDriver();
    d.exec(
      "INSERT INTO spaces (id, name, color, created_at, updated_at) VALUES ('s1', 'P', 'blue', ?, ?)",
      now(),
      now(),
    );
    d.exec(
      "INSERT INTO entities (id, space_id, type, title, created_at, updated_at, key_prefix, key_number) VALUES ('t1', 's1', 'task', 'Buy milk and eggs', ?, ?, 'TSK', 1)",
      now(),
      now(),
    );
    d.exec("INSERT INTO tasks (entity_id, status_id) VALUES ('t1', 'todo')");
    const view = await describeConflict(
      d,
      {
        id: "c1",
        table: "entities",
        pk: "t1",
        field: "title",
        losingValue: "Buy oat milk",
        losingClock: "1791999000000-000001-aaa",
        winningClock: "1791999005000-000001-bbb",
        createdAt: now(),
      },
      {
        thisDeviceId: "bbb",
        names: new Map([
          ["aaa", "MacBook"],
          ["bbb", "iPhone"],
        ]),
        thisDeviceName: "iPhone",
      },
    );
    expect(view).toMatchObject({
      itemId: "t1",
      itemTitle: "Buy milk and eggs",
      fieldLabel: "Title",
      current: "Buy milk and eggs",
      other: "Buy oat milk",
      isText: true,
    });
    expect(view.currentSide).toMatchObject({ device: "iPhone", isThisDevice: true });
    expect(view.otherSide).toMatchObject({ device: "MacBook", isThisDevice: false });
    expect(view.currentSide.at?.getTime()).toBe(1791999005000);
  });

  it("tells two devices with the same name apart", async () => {
    const d = new NodeSqliteDriver();
    const view = await describeConflict(
      d,
      {
        id: "c9",
        table: "entities",
        pk: "gone",
        field: "title",
        losingValue: "A",
        losingClock: "1791999000000-000001-aaa",
        winningClock: "1791999005000-000001-bbb",
        createdAt: now(),
      },
      {
        thisDeviceId: "bbb",
        thisDeviceName: "Nookly on Mac",
        names: new Map([["aaa", "Nookly on Mac"]]),
      },
    );
    expect(view.currentSide.device).toBe("Mac");
    expect(view.otherSide.device).toBe("Another Mac");
  });

  it("finds the page behind a block and the task behind its dates", async () => {
    const d = new NodeSqliteDriver();
    d.exec(
      "INSERT INTO spaces (id, name, color, created_at, updated_at) VALUES ('s1', 'P', 'blue', ?, ?)",
      now(),
      now(),
    );
    d.exec(
      "INSERT INTO entities (id, space_id, type, title, created_at, updated_at, key_prefix, key_number) VALUES ('n1', 's1', 'note', 'Trip', ?, ?, 'NOT', 1)",
      now(),
      now(),
    );
    d.exec(
      "INSERT INTO blocks (id, entity_id, position, block_type, content, created_at, updated_at) VALUES ('b1', 'n1', 0, 'paragraph', 'Tent', ?, ?)",
      now(),
      now(),
    );
    const view = await describeConflict(
      d,
      {
        id: "c2",
        table: "blocks",
        pk: "b1",
        field: "content",
        losingValue: "Stove",
        losingClock: null,
        winningClock: null,
        createdAt: now(),
      },
      { thisDeviceId: "x", names: new Map(), thisDeviceName: "Mac" },
    );
    expect(view).toMatchObject({
      itemId: "n1",
      itemTitle: "Trip",
      fieldLabel: "Text",
      current: "Tent",
    });
    expect(view.otherSide.device).toBe("Another device");
  });

  it("describes a row removed on one device and edited on the other", async () => {
    const d = new NodeSqliteDriver();
    const view = await describeConflict(
      d,
      {
        id: "c3",
        table: "entities",
        pk: "gone",
        field: null,
        losingValue: '{"title":"Old"}',
        losingClock: null,
        winningClock: null,
        createdAt: now(),
      },
      { thisDeviceId: "x", names: new Map(), thisDeviceName: "Mac" },
    );
    expect(view.kind).toBe("removed");
  });
});

describe("merging the lists", () => {
  it("lists device and server conflicts together, newest first, once each", () => {
    const device = [
      {
        id: "d1",
        table: "entities",
        pk: "t1",
        field: "title",
        losingValue: "A",
        losingClock: "1-1-a",
        winningClock: "2-1-b",
        createdAt: "2026-10-14T10:00:00Z",
      },
    ];
    const server = [
      {
        id: "s1",
        table: "entities",
        pk: "t1",
        field: "title",
        losingValue: "A",
        losingClock: "1-1-a",
        winningClock: "2-1-b",
        createdAt: "2026-10-14T10:00:01Z",
      },
      {
        id: "s2",
        table: "tasks",
        pk: "t1",
        field: "effort",
        losingValue: 3,
        losingClock: "1-1-a",
        winningClock: "2-1-b",
        createdAt: "2026-10-14T11:00:00Z",
      },
    ];
    const merged = mergeConflictLists(device, server);
    expect(merged.map((c) => [c.source, c.id])).toEqual([
      ["server", "s2"],
      ["device", "d1"],
    ]);
  });
});
