import { describe, expect, it } from "vitest";
import {
  VIEW_CONFIG_VERSION,
  parseViewConfig,
  parseViewMeta,
  serializeViewConfig,
} from "./view-config.ts";
import {
  normalizeDisplay as normalizeTaskDisplay,
  OVERVIEW_DISPLAY as TASK_OVERVIEW_DISPLAY,
  DEFAULT_DISPLAY as TASK_DEFAULT_DISPLAY,
} from "#/features/tasks/task-model.ts";
import {
  normalizeDisplay as normalizeAssignmentDisplay,
  DEFAULT_DISPLAY as ASSIGNMENT_DEFAULT_DISPLAY,
} from "#/features/assignments/assignment-model.ts";

const display = (stored: Partial<{ layout: string }>) => ({ layout: stored.layout ?? "list" });

describe("view config filters", () => {
  it("keeps how a filter is joined to the one before it", () => {
    const raw = serializeViewConfig({
      filters: [
        { fieldId: "status", operator: "is", values: ["a"] },
        { fieldId: "labels", operator: "isNot", values: ["b"], join: "or" },
      ],
      display: display({}),
    });
    expect(parseViewConfig(raw, display).filters).toEqual([
      { fieldId: "status", operator: "is", values: ["a"] },
      { fieldId: "labels", operator: "isNot", values: ["b"], join: "or" },
    ]);
  });

  it("reads a View saved before filters could be joined as and", () => {
    const raw = '{"filters":[{"fieldId":"status","operator":"is","values":["a"]}]}';
    expect(parseViewConfig(raw, display).filters).toEqual([
      { fieldId: "status", operator: "is", values: ["a"] },
    ]);
  });

  it("drops a join it does not know", () => {
    const raw = '{"filters":[{"fieldId":"status","operator":"is","values":["a"],"join":"xor"}]}';
    expect(parseViewConfig(raw, display).filters).toEqual([
      { fieldId: "status", operator: "is", values: ["a"] },
    ]);
  });
});

describe("view config conditions", () => {
  it("reads the richer filters apart from the option filters", () => {
    const raw = JSON.stringify({
      filters: [
        { fieldId: "status", operator: "is", values: ["a"] },
        { fieldId: "due", operator: "between", values: ["2026-11-01", "2026-11-30"] },
        { fieldId: "effort", operator: "gte", values: ["3"] },
        { fieldId: "title", operator: "contains", values: ["essay"] },
        { fieldId: "due", operator: "isEmpty", values: [] },
      ],
    });
    const config = parseViewConfig(raw, display);
    expect(config.filters).toEqual([{ fieldId: "status", operator: "is", values: ["a"] }]);
    expect(config.conditions).toEqual([
      { fieldId: "due", operator: "between", values: ["2026-11-01", "2026-11-30"] },
      { fieldId: "effort", operator: "gte", values: ["3"] },
      { fieldId: "title", operator: "contains", values: ["essay"] },
      { fieldId: "due", operator: "isEmpty", values: [] },
    ]);
  });

  it("drops a condition whose values do not fit its operator", () => {
    const raw = JSON.stringify({
      filters: [
        { fieldId: "due", operator: "between", values: ["2026-11-01"] },
        { fieldId: "due", operator: "before", values: ["soon"] },
        { fieldId: "effort", operator: "gt", values: ["many"] },
        { fieldId: "title", operator: "contains", values: [""] },
        { fieldId: "title", operator: "matches", values: ["x"] },
      ],
    });
    expect(parseViewConfig(raw, display).conditions).toEqual([]);
  });

  it("leaves out a condition still being typed", () => {
    const raw = serializeViewConfig({
      filters: [],
      conditions: [{ fieldId: "title", operator: "contains", values: [""] }],
      display: display({}),
    });
    expect(JSON.parse(raw).filters).toEqual([]);
  });

  it("writes conditions back into the one filters list", () => {
    const raw = serializeViewConfig({
      filters: [{ fieldId: "status", operator: "is", values: ["a"] }],
      conditions: [{ fieldId: "due", operator: "before", values: ["2026-12-01"] }],
      display: display({}),
    });
    expect(JSON.parse(raw).filters).toEqual([
      { fieldId: "status", operator: "is", values: ["a"] },
      { fieldId: "due", operator: "before", values: ["2026-12-01"] },
    ]);
  });
});

describe("view config version, source and scope", () => {
  it("reads a config without a version as the first version of its module", () => {
    expect(parseViewMeta('{"filters":[]}', "tasks")).toEqual({
      version: 1,
      source: "task",
      scope: null,
      newer: false,
    });
    expect(parseViewMeta("{}", "assignments-overview").source).toBe("assignment");
    expect(parseViewMeta("not json", "tasks-overview")).toEqual({
      version: 1,
      source: "task",
      scope: null,
      newer: false,
    });
  });

  it("reads a stored source and scope", () => {
    const raw = JSON.stringify({
      version: 2,
      source: "exam",
      scope: { relationship: "exam-course", direction: "outgoing" },
    });
    expect(parseViewMeta(raw)).toEqual({
      version: 2,
      source: "exam",
      scope: { relationship: "exam-course", direction: "outgoing" },
      newer: false,
    });
  });

  it("drops a scope it can not read", () => {
    const raw = JSON.stringify({ scope: { relationship: "exam-course", direction: "sideways" } });
    expect(parseViewMeta(raw).scope).toBeNull();
  });

  it("flags a config saved by a newer version", () => {
    expect(parseViewMeta(JSON.stringify({ version: VIEW_CONFIG_VERSION + 1 })).newer).toBe(true);
  });

  it("writes its version and source", () => {
    const raw = serializeViewConfig({ filters: [], display: {}, module: "tasks" });
    expect(JSON.parse(raw)).toEqual({
      version: VIEW_CONFIG_VERSION,
      source: "task",
      filters: [],
      display: {},
    });
  });

  it("keeps what it can not read when saving over a stored config", () => {
    const previous = JSON.stringify({
      version: 2,
      scope: { relationship: "assignment-course", direction: "outgoing" },
      future: { kept: true },
      filters: [
        { fieldId: "status", operator: "is", values: ["old"] },
        { fieldId: "due", operator: "withinNext", values: ["3"] },
      ],
      display: { layout: "list", someday: 1 },
    });
    const raw = serializeViewConfig({
      filters: [{ fieldId: "status", operator: "is", values: ["new"] }],
      display: { layout: "table" },
      module: "assignments",
      previous,
    });
    expect(JSON.parse(raw)).toEqual({
      version: 2,
      source: "assignment",
      scope: { relationship: "assignment-course", direction: "outgoing" },
      future: { kept: true },
      filters: [
        { fieldId: "status", operator: "is", values: ["new"] },
        { fieldId: "due", operator: "withinNext", values: ["3"] },
      ],
      display: { layout: "table", someday: 1 },
    });
  });
});

/// Views saved by the releases before the view engine, as they sit in the database.
/// Each must open exactly as it did: the same filters and the same display.
describe("Views saved before the view engine", () => {
  const OLD_TASKS =
    '{"filters":[{"fieldId":"status","operator":"isNot","values":["done","cancelled"]},{"fieldId":"due","operator":"is","values":["today","week"],"join":"or"}],"display":{"layout":"board","grouping":"status","subGrouping":"none","ordering":"due","showEmpty":{"board":true,"list":false},"hiddenColumns":["done","cancelled"],"properties":["key","status","due"]}}';
  const OLD_TASKS_OVERVIEW =
    '{"filters":[{"fieldId":"space","operator":"is","values":["s1"]}],"display":{"layout":"list","grouping":"due","subGrouping":"space","ordering":"start","showEmpty":{"board":true,"list":true},"hiddenColumns":[],"properties":["key","due","effort"]}}';
  const OLD_ASSIGNMENTS =
    '{"filters":[{"fieldId":"course","operator":"is","values":["c1"]},{"fieldId":"evaluatedAt","operator":"is","values":["none"]}],"display":{"layout":"list","grouping":"course","subGrouping":"status","ordering":"grade","showEmpty":{"board":false,"list":false},"hiddenColumns":["x"]}}';
  const OLD_ASSIGNMENTS_OVERVIEW =
    '{"filters":[],"display":{"layout":"board","grouping":"space","subGrouping":"none","ordering":"auto","showEmpty":{"board":true,"list":false},"hiddenColumns":[]}}';

  it("opens a Tasks View as before", () => {
    const config = parseViewConfig(OLD_TASKS, normalizeTaskDisplay);
    const stored = JSON.parse(OLD_TASKS);
    expect(config.filters).toEqual(stored.filters);
    expect(config.conditions).toEqual([]);
    expect(config.display).toEqual({ ...stored.display, table: { sort: [], columns: [] } });
  });

  it("opens a Tasks overview View as before", () => {
    const config = parseViewConfig(OLD_TASKS_OVERVIEW, normalizeTaskDisplay);
    const stored = JSON.parse(OLD_TASKS_OVERVIEW);
    expect(config.filters).toEqual(stored.filters);
    expect(config.display).toEqual({ ...stored.display, table: { sort: [], columns: [] } });
  });

  it("opens an Assignments View as before", () => {
    const config = parseViewConfig(OLD_ASSIGNMENTS, normalizeAssignmentDisplay);
    const stored = JSON.parse(OLD_ASSIGNMENTS);
    expect(config.filters).toEqual(stored.filters);
    expect(config.display).toEqual({ ...stored.display, table: { sort: [], columns: [] } });
  });

  it("opens an Assignments overview View as before", () => {
    const config = parseViewConfig(OLD_ASSIGNMENTS_OVERVIEW, normalizeAssignmentDisplay);
    const stored = JSON.parse(OLD_ASSIGNMENTS_OVERVIEW);
    expect(config.filters).toEqual(stored.filters);
    expect(config.display).toEqual({ ...stored.display, table: { sort: [], columns: [] } });
  });

  it("opens an empty or unreadable View as the module defaults", () => {
    for (const raw of ["{}", "nope", "[]", '{"filters":"x","display":3}']) {
      expect(parseViewConfig(raw, normalizeTaskDisplay)).toEqual({
        filters: [],
        conditions: [],
        display: TASK_DEFAULT_DISPLAY,
      });
      expect(parseViewConfig(raw, normalizeAssignmentDisplay).display).toEqual(
        ASSIGNMENT_DEFAULT_DISPLAY,
      );
    }
  });

  it("keeps the overview defaults a cross-Space page opens with", () => {
    expect(TASK_OVERVIEW_DISPLAY.table).toEqual({ sort: [], columns: [] });
  });
});

describe("table display", () => {
  it("reads a stored sort and column widths", () => {
    const raw = JSON.stringify({
      display: {
        layout: "table",
        table: {
          sort: [{ field: "due", direction: "desc" }],
          columns: [{ field: "title", width: 320 }, { field: "status" }],
        },
      },
    });
    expect(parseViewConfig(raw, normalizeTaskDisplay).display).toMatchObject({
      layout: "table",
      table: {
        sort: [{ field: "due", direction: "desc" }],
        columns: [{ field: "title", width: 320 }, { field: "status" }],
      },
    });
  });

  it("drops a sort or column it can not read and keeps widths within bounds", () => {
    const raw = JSON.stringify({
      display: {
        layout: "table",
        table: {
          sort: [{ field: "due", direction: "up" }, { field: 3 }],
          columns: [{ field: "title", width: 99999 }, { field: "" }, { field: "status", width: 2 }],
        },
      },
    });
    expect(parseViewConfig(raw, normalizeTaskDisplay).display.table).toEqual({
      sort: [],
      columns: [
        { field: "title", width: 800 },
        { field: "status", width: 60 },
      ],
    });
  });
});
