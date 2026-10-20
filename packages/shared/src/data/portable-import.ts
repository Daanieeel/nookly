import { z } from "zod";
import type { SqlStatement } from "../sync/sql.ts";
import { type LocalDb, first, iso, rows, str, write } from "./db.ts";
import { createEntityStatements } from "./entities.ts";
import { importDeckFile, readDeckFile } from "./portable.ts";
import { EFFORT_STEPS } from "../effort.ts";
import { createTaskStatements, repeatRuleSchema } from "./tasks.ts";

/// Reading Nookly files: a page, a task, a deck or an assignment from the desktop (or another
/// phone) as a new item here, never a change to an existing one. The rules are the desktop's
/// (`db/page_json.rs`, `task_json.rs`, `assignment_json.rs`): the file is read and checked
/// whole before anything is made, and what is made lands in one transaction, so a file that
/// does not pass leaves nothing behind. A block type this phone has no editor for becomes a
/// paragraph, so its text survives.

const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

/// The block types the phone takes as they are, with the attributes each may carry.
const KNOWN_BLOCKS = new Map<string, { attrs: Map<string, "toggle" | "marker" | "int" | "text"> }>([
  ["paragraph", { attrs: new Map() }],
  ...["heading1", "heading2", "heading3", "heading4", "heading5", "heading6"].map(
    (type) => [type, { attrs: new Map([["toggle", "toggle" as const]]) }] as const,
  ),
  ["quote", { attrs: new Map() }],
  ["code", { attrs: new Map() }],
  ["bulleted_list", { attrs: new Map() }],
  [
    "numbered_list",
    {
      attrs: new Map([
        ["marker", "marker" as const],
        ["start", "int" as const],
        ["nestedStarts", "text" as const],
      ]),
    },
  ],
  ["table", { attrs: new Map([["pinned", "int" as const]]) }],
]);
/// The blocks only the structure of which the editor knows: their content is read leniently
/// (`blocks/custom-rows.ts`), and the attributes each declares are text.
const CUSTOM_ATTRS = new Map<string, string[]>([
  ["callout", ["variant"]],
  ["timeline", ["title"]],
  ["progress", ["title"]],
  ["tree", ["title"]],
  ["steps", ["title", "current"]],
  ["stats", ["title"]],
  ["details", ["title"]],
  ["checklist", []],
  ["equation", ["view"]],
  ["math", ["view"]],
  ["diagram", ["view"]],
  ["circuit", ["view", "drawing"]],
  ["entity_card", []],
  ["image", ["caption"]],
  ["video", ["caption"]],
  ["audio", ["caption"]],
  ["file", ["caption", "page"]],
  ["bookmark", []],
  ["embed", []],
  ["divider", []],
]);
for (const [type, names] of CUSTOM_ATTRS) {
  KNOWN_BLOCKS.set(type, { attrs: new Map(names.map((name) => [name, "text" as const])) });
}
KNOWN_BLOCKS.set("toggle", { attrs: new Map([["toggle", "toggle" as const]]) });
const TOGGLE = ["open", "closed"];
const MARKERS = ["a.", "a)", "A.", "A)"];

const day = z.string().refine((value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}, "must be a date like 2026-03-10");

const blockFile = z.object({
  type: z.string(),
  content: z.string(),
  language: z.string().nullish(),
  filename: z.string().nullish(),
  attrs: z.record(z.string(), z.string()).default({}),
});
type BlockFile = z.infer<typeof blockFile>;

const statusFile = z
  .object({ name: z.string(), doneness: z.number().int().min(0).max(100) })
  .strict();
const effort = z
  .number()
  .int()
  .refine(
    (value) => EFFORT_STEPS.some((step) => step.value === value),
    "must be one of 1, 2, 3, 5, 8 or 13",
  )
  .nullish();
const repeat = repeatRuleSchema.strict().nullish();

const pageFile = z.object({
  format: z.literal("nookly-page"),
  version: z.literal(1),
  kind: z.enum(["note", "jot"]),
  title: z.string(),
  blocks: z.array(blockFile),
});

const subtaskFile = z
  .object({
    title: z.string(),
    status: statusFile,
    startDate: day.nullish(),
    dueDate: day.nullish(),
    effort,
    blocks: z.array(blockFile).default([]),
  })
  .strict();

const taskFile = z
  .object({
    format: z.literal("nookly-task"),
    version: z.literal(1),
    kind: z.literal("task"),
    title: z.string(),
    status: statusFile,
    startDate: day.nullish(),
    dueDate: day.nullish(),
    effort,
    repeat,
    blocks: z.array(blockFile).default([]),
    subtasks: z.array(subtaskFile).default([]),
  })
  .strict();

const ASSIGNMENT_STATUSES = ["not_started", "in_progress", "submitted", "graded"] as const;
const assignmentFile = z
  .object({
    format: z.literal("nookly-assignment"),
    version: z.literal(1),
    kind: z.literal("assignment"),
    title: z.string(),
    course: z.string().nullish(),
    status: z.enum(ASSIGNMENT_STATUSES),
    dueDate: day.nullish(),
    grade: z.number().finite().min(0).nullish(),
    weight: z.number().finite().min(0).nullish(),
    blocks: z.array(blockFile).default([]),
  })
  .strict();

type PageFile = z.infer<typeof pageFile>;
type TaskFile = z.infer<typeof taskFile>;
type AssignmentFile = z.infer<typeof assignmentFile>;
type Parsed =
  | { format: "nookly-page"; file: PageFile }
  | { format: "nookly-task"; file: TaskFile }
  | { format: "nookly-assignment"; file: AssignmentFile }
  | { format: "nookly-deck"; file: ReturnType<typeof readDeckFile> };

const NOUN = new Map([
  ["nookly-page", "page"],
  ["nookly-task", "task"],
  ["nookly-assignment", "assignment"],
  ["nookly-deck", "deck"],
]);

/// Where a schema complains, in words: "dueDate must be a date like 2026-03-10".
function complaint(error: z.ZodError, what: string): string {
  const issue = error.issues[0];
  if (!issue) return `this ${what} file is not valid`;
  const path = issue.path.filter((p) => !Number.isInteger(p)).join(".");
  const index = issue.path.map(Number).find((p) => Number.isInteger(p));
  if (issue.code === "unrecognized_keys")
    return `this ${what} file is not valid (${issue.message})`;
  const where = [
    path.startsWith("subtasks") && index !== undefined ? `sub-task ${index + 1}` : null,
    path && !path.startsWith("subtasks") ? path : path.replace(/^subtasks\.?/, "") || null,
  ]
    .filter(Boolean)
    .join(": ");
  return `this ${what} file is not valid${where ? `: ${where} ${issue.message.toLowerCase()}` : ""}`;
}

interface Header {
  format: string;
  version: unknown;
  json: unknown;
}

function parseHeader(text: string): Header {
  if (text.length > MAX_IMPORT_BYTES) {
    throw new Error("This file is too large to import (the limit is 20 MB).");
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("This is not a Nookly file.");
  }
  const header = z
    .object({ format: z.string().optional(), version: z.unknown().optional() })
    .safeParse(json);
  const format = header.success ? header.data.format : undefined;
  const noun = format ? NOUN.get(format) : undefined;
  if (!format || !noun) {
    throw new Error(`This is not a Nookly file (format "${format ?? "none"}").`);
  }
  return { format, version: header.success ? header.data.version : undefined, json };
}

/// A Nookly file read and checked without touching the data.
function parseNooklyFile(text: string): Parsed {
  const { format, version, json } = parseHeader(text);
  const noun = NOUN.get(format) ?? "item";
  if (version !== 1) {
    throw new Error(
      `This ${noun} file is version ${String(version ?? "unknown")}, and this version of Nookly reads version 1.`,
    );
  }
  if (format === "nookly-deck") return { format, file: readDeckFile(text) };
  const schema =
    format === "nookly-page" ? pageFile : format === "nookly-task" ? taskFile : assignmentFile;
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    // Which `kind` was wrong is the useful word for a page or a task.
    const kind = z.object({ kind: z.string() }).safeParse(json);
    if (kind.success && parsed.error.issues.some((i) => i.path[0] === "kind")) {
      throw new Error(
        `This ${noun} file holds a "${kind.data.kind}", not a ${noun === "page" ? "note or a jot" : noun}.`,
      );
    }
    throw new Error(complaint(parsed.error, noun).replace(/^this/, "This"));
  }
  if (format === "nookly-page") checkBlocks(pageFile.parse(json).blocks);
  if (format === "nookly-task") {
    const file = taskFile.parse(json);
    checkBlocks(file.blocks);
    for (const sub of file.subtasks) checkBlocks(sub.blocks);
    return { format, file };
  }
  if (format === "nookly-assignment") {
    const file = assignmentFile.parse(json);
    checkBlocks(file.blocks);
    return { format, file };
  }
  return { format: "nookly-page", file: pageFile.parse(json) };
}

/// A block that is a known type must pass that type's checks; an unknown one passes as the
/// paragraph it becomes.
function checkBlocks(blocks: BlockFile[]) {
  blocks.forEach((block, index) => {
    const known = KNOWN_BLOCKS.get(block.type);
    if (!known) return;
    for (const [key, value] of Object.entries(block.attrs)) {
      const kind = known.attrs.get(key);
      const fail = (reason: string) => new Error(`block ${index + 1}: ${reason}`);
      if (!kind) {
        const names = [...known.attrs.keys()];
        throw fail(
          names.length === 0
            ? `block type '${block.type}' takes no attrs, got '${key}'`
            : `block type '${block.type}' has no attr '${key}' (known: ${names.join(", ")})`,
        );
      }
      if (value === "") continue;
      if (kind === "toggle" && !TOGGLE.includes(value)) {
        throw fail(
          `attr '${key}' on '${block.type}' must be one of ${TOGGLE.join(", ")}, got '${value}'`,
        );
      }
      if (kind === "marker" && !MARKERS.includes(value)) {
        throw fail(
          `attr '${key}' on '${block.type}' must be one of ${MARKERS.join(", ")}, got '${value}'`,
        );
      }
      if (kind === "int" && !(/^\d+$/.test(value) && Number(value) >= 1)) {
        throw fail(`attr '${key}' on '${block.type}' must be a whole number >= 1, got '${value}'`);
      }
    }
  });
}

/// What an import would create, for the check before it: the item's own facts and its parts.
export interface ImportPreview {
  format: string;
  kind: string;
  title: string;
  facts: string[];
  count: number;
  countLabel: string;
  items: { label: string; text: string; converted: boolean }[];
  /// Parts of a kind this phone has no editor for, which arrive as paragraphs.
  converted: number;
  /// What the file has to be filed under, when it has to be (an assignment needs a course).
  parentType: "course" | null;
}

const LINE = 80;
const firstLine = (content: string): string => {
  const line =
    content
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean) ?? "";
  return line.length > LINE ? `${line.slice(0, LINE)}...` : line;
};

function blockItems(blocks: BlockFile[]) {
  const items = blocks.map((b) => ({
    label: b.type,
    text: firstLine(b.content),
    converted: !KNOWN_BLOCKS.has(b.type),
  }));
  return { items, converted: items.filter((i) => i.converted).length };
}

const words = (status: string) => {
  const spaced = status.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

/// Reads a Nookly file and says what it holds, or why it can not be read.
export function previewNooklyFile(text: string): ImportPreview {
  const parsed = parseNooklyFile(text);
  if (parsed.format === "nookly-deck") {
    const items = parsed.file.cards.map((c) => ({
      label: "Card",
      text: firstLine(c.front),
      converted: false,
    }));
    return {
      format: parsed.format,
      kind: "deck",
      title: parsed.file.title,
      facts: [],
      count: items.length,
      countLabel: "card",
      items,
      converted: 0,
      parentType: null,
    };
  }
  if (parsed.format === "nookly-page") {
    const { items, converted } = blockItems(parsed.file.blocks);
    return {
      format: parsed.format,
      kind: parsed.file.kind,
      title: parsed.file.title,
      facts: [],
      count: items.length,
      countLabel: "block",
      items,
      converted,
      parentType: null,
    };
  }
  if (parsed.format === "nookly-task") {
    const file = parsed.file;
    const facts = [`Status: ${file.status.name}`];
    if (file.dueDate) facts.push(`Due ${file.dueDate}`);
    if (file.startDate) facts.push(`Starts ${file.startDate}`);
    if (file.effort) facts.push(`Effort ${file.effort}`);
    if (file.repeat) {
      facts.push(
        `Repeats every ${file.repeat.every} ${file.repeat.unit}${file.repeat.every === 1 ? "" : "s"}`,
      );
    }
    const { items: blocks, converted } = blockItems(file.blocks);
    if (blocks.length > 0) {
      facts.push(`${blocks.length} description block${blocks.length === 1 ? "" : "s"}`);
    }
    const items = file.subtasks.map((s) => ({
      label: s.status.name,
      text: firstLine(s.title),
      converted: false,
    }));
    return {
      format: parsed.format,
      kind: "task",
      title: file.title,
      facts,
      count: items.length,
      countLabel: "subtask",
      items,
      converted,
      parentType: null,
    };
  }
  const file = parsed.file;
  const facts = [`Status: ${words(file.status)}`];
  if (file.dueDate) facts.push(`Due ${file.dueDate}`);
  if (file.grade !== null && file.grade !== undefined) facts.push(`Grade ${file.grade}`);
  if (file.weight !== null && file.weight !== undefined) facts.push(`Weight ${file.weight}`);
  if (file.course) facts.push(`From the course ${file.course}`);
  const { items, converted } = blockItems(file.blocks);
  return {
    format: parsed.format,
    kind: "assignment",
    title: file.title,
    facts,
    count: items.length,
    countLabel: "block",
    items,
    converted,
    parentType: "course",
  };
}

/// The statements that put a file's blocks on an entity, after its own: an unknown type as a
/// paragraph with no attributes, a known one with the attributes it declares.
function blockStatements(db: LocalDb, entityId: string, blocks: BlockFile[]): SqlStatement[] {
  const now = iso(db);
  return blocks.map((block, position) => {
    const known = KNOWN_BLOCKS.has(block.type);
    const attrs = known
      ? Object.fromEntries(Object.entries(block.attrs).filter(([, value]) => value !== ""))
      : {};
    return {
      sql: "INSERT INTO blocks (id, entity_id, position, block_type, content, language, filename, attrs, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      params: [
        db.newId(),
        entityId,
        position,
        known ? block.type : "paragraph",
        block.content,
        known ? (block.language ?? null) : null,
        known ? (block.filename ?? null) : null,
        Object.keys(attrs).length > 0
          ? JSON.stringify(
              Object.fromEntries(Object.entries(attrs).sort(([a], [b]) => a.localeCompare(b))),
            )
          : null,
        now,
        now,
      ],
    } satisfies SqlStatement;
  });
}

/// The task status a file's status lands on: the one with its name (ignoring case), else the
/// first with its doneness, else the first there is.
async function resolveStatus(
  db: LocalDb,
  status: { name: string; doneness: number },
): Promise<{ id: string; doneness: number }> {
  const all = (
    await rows(db, "SELECT id, name, doneness FROM task_statuses ORDER BY position")
  ).map((r) => ({ id: str(r.id), name: str(r.name), doneness: Number(r.doneness) }));
  const wanted = status.name.trim().toLowerCase();
  const found =
    all.find((s) => s.name.trim().toLowerCase() === wanted) ??
    all.find((s) => s.doneness === status.doneness) ??
    all[0];
  if (!found) throw new Error("There are no task statuses to import into.");
  return found;
}

async function taskFields(
  db: LocalDb,
  id: string,
  part: {
    status: { name: string; doneness: number };
    startDate?: string | null;
    dueDate?: string | null;
    effort?: number | null;
    blocks: BlockFile[];
  },
): Promise<SqlStatement[]> {
  const status = await resolveStatus(db, part.status);
  return [
    {
      // Written straight, so a finished one never starts a next occurrence. Finished on
      // arrival: the day it arrived, which is all that is known.
      sql: "UPDATE tasks SET status_id = ?, completed_at = ?, start_date = ?, due_date = ?, effort = ? WHERE entity_id = ?",
      params: [
        status.id,
        status.doneness >= 100 ? iso(db) : null,
        part.startDate ?? null,
        part.dueDate ?? null,
        part.effort ?? null,
        id,
      ],
    },
    ...blockStatements(db, id, part.blocks),
  ];
}

/// A new item from a Nookly file, in `spaceId`; an assignment is filed under `parentId`, a
/// course. Returns the new item's id. Checked whole first, made in one transaction.
export async function importNooklyFile(
  db: LocalDb,
  spaceId: string,
  text: string,
  parentId: string | null = null,
): Promise<string> {
  const parsed = parseNooklyFile(text);
  if (parsed.format === "nookly-deck") return importDeckFile(db, spaceId, text);
  if (parsed.format === "nookly-page") {
    const made = createEntityStatements(db, spaceId, parsed.file.kind, parsed.file.title);
    await write(db, [...made.statements, ...blockStatements(db, made.id, parsed.file.blocks)]);
    return made.id;
  }
  if (parsed.format === "nookly-task") {
    const file = parsed.file;
    const made = createTaskStatements(db, spaceId, file.title, null, null);
    const statements: SqlStatement[] = [
      ...made.statements,
      ...(await taskFields(db, made.id, file)),
      {
        sql: "UPDATE tasks SET repeat_rule = ? WHERE entity_id = ?",
        params: [file.repeat ? JSON.stringify(file.repeat) : null, made.id],
      },
    ];
    for (const sub of file.subtasks) {
      const child = createEntityStatements(db, spaceId, "sub_task", sub.title);
      statements.push(
        ...child.statements,
        {
          sql: "INSERT INTO tasks (entity_id, status_id, start_date, due_date) VALUES (?, 'backlog', NULL, NULL)",
          params: [child.id],
        },
        {
          sql: "INSERT INTO relationships (id, from_entity_id, to_entity_id, relationship_type, created_at) VALUES (?, ?, ?, 'sub-task-of', ?)",
          params: [db.newId(), child.id, made.id, iso(db)],
        },
        ...(await taskFields(db, child.id, sub)),
      );
    }
    await write(db, statements);
    return made.id;
  }
  if (!parentId) throw new Error("An assignment needs a course to go in.");
  const course = await first(
    db,
    "SELECT type FROM entities WHERE id = ? AND deleted_at IS NULL",
    parentId,
  );
  if (!course || str(course.type) !== "course") throw new Error("An assignment goes in a course.");
  const file = parsed.file;
  const made = createEntityStatements(db, spaceId, "assignment", file.title);
  await write(db, [
    ...made.statements,
    {
      sql: "INSERT INTO assignments (entity_id, due_date, status, grade, weight) VALUES (?, ?, ?, ?, ?)",
      params: [made.id, file.dueDate ?? null, file.status, file.grade ?? null, file.weight ?? null],
    },
    {
      sql: "INSERT INTO relationships (id, from_entity_id, to_entity_id, relationship_type, created_at) VALUES (?, ?, ?, 'assignment-course', ?)",
      params: [db.newId(), made.id, parentId, iso(db)],
    },
    ...blockStatements(db, made.id, file.blocks),
  ]);
  return made.id;
}
