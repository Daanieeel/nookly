import { z } from "zod";
import type { SqlStatement } from "../sync/sql.ts";
import { type LocalDb, first, iso, num, optStr, rows, str, write } from "./db.ts";
import {
  type EntityRecord,
  type PlannedCreate,
  createEntityStatements,
  toEntity,
} from "./entities.ts";

export interface TaskStatus {
  id: string;
  name: string;
  color: string;
  /// 0 open, 50 in progress, 100 finished (done or cancelled).
  doneness: number;
  position: number;
}

export const repeatRuleSchema = z.object({
  every: z.number().int().min(1).max(365),
  unit: z.enum(["day", "week", "month"]),
});
export type RepeatRule = z.infer<typeof repeatRuleSchema>;

export interface TaskRecord {
  entity: EntityRecord;
  statusId: string;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  effort: number | null;
  repeat: RepeatRule | null;
}

function parseRepeat(raw: string | null): RepeatRule | null {
  if (!raw) return null;
  try {
    const parsed = repeatRuleSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const TASK_SELECT = `SELECT e.id, e.space_id, e.type, e.title, e.icon, e.pinned, e.created_at, e.updated_at, e.deleted_at, e.key_prefix, e.key_number, e.last_opened_at,
  t.status_id, t.start_date, t.due_date, t.completed_at, t.effort, t.repeat_rule
  FROM entities e JOIN tasks t ON t.entity_id = e.id`;

function toTask(row: Record<string, string | number | null>): TaskRecord {
  return {
    entity: toEntity(row),
    statusId: str(row.status_id),
    startDate: optStr(row.start_date),
    dueDate: optStr(row.due_date),
    completedAt: optStr(row.completed_at),
    effort: row.effort === null || row.effort === undefined ? null : num(row.effort),
    repeat: parseRepeat(optStr(row.repeat_rule)),
  };
}

export async function listStatuses(db: LocalDb): Promise<TaskStatus[]> {
  return (
    await rows(
      db,
      "SELECT id, name, color, doneness, position FROM task_statuses ORDER BY position",
    )
  ).map((r) => ({
    id: str(r.id),
    name: str(r.name),
    color: str(r.color),
    doneness: num(r.doneness),
    position: num(r.position),
  }));
}

/// Tasks of one Space, or of every Space (the cross Space overview). Sub-tasks too.
export async function listTasks(db: LocalDb, spaceId?: string): Promise<TaskRecord[]> {
  const where = ["e.deleted_at IS NULL", "e.hidden_at IS NULL"];
  const params: string[] = [];
  if (spaceId) {
    where.push("e.space_id = ?");
    params.push(spaceId);
  }
  return (
    await rows(
      db,
      `${TASK_SELECT} WHERE ${where.join(" AND ")} ORDER BY t.due_date IS NULL, t.due_date, e.created_at DESC`,
      ...params,
    )
  ).map(toTask);
}

export async function getTask(db: LocalDb, id: string): Promise<TaskRecord | null> {
  const row = await first(db, `${TASK_SELECT} WHERE e.id = ?`, id);
  return row ? toTask(row) : null;
}

function createTaskStatements(
  db: LocalDb,
  spaceId: string,
  title: string,
  startDate: string | null,
  dueDate: string | null,
): PlannedCreate {
  const created = createEntityStatements(db, spaceId, "task", title);
  return {
    id: created.id,
    statements: [
      ...created.statements,
      {
        sql: "INSERT INTO tasks (entity_id, status_id, start_date, due_date) VALUES (?, 'backlog', ?, ?)",
        params: [created.id, startDate, dueDate],
      },
    ],
  };
}

/// `create_task`: a new task starts in the Backlog.
export async function createTask(
  db: LocalDb,
  spaceId: string,
  title: string,
  dueDate: string | null = null,
): Promise<string> {
  const { id, statements } = createTaskStatements(db, spaceId, title, null, dueDate);
  await write(db, statements);
  return id;
}

export async function setTaskDates(
  db: LocalDb,
  id: string,
  startDate: string | null,
  dueDate: string | null,
): Promise<void> {
  await write(db, [
    {
      sql: "UPDATE tasks SET start_date = ?, due_date = ? WHERE entity_id = ?",
      params: [startDate, dueDate, id],
    },
    { sql: "UPDATE entities SET updated_at = ? WHERE id = ?", params: [iso(db), id] },
  ]);
}

export async function setTaskRepeat(
  db: LocalDb,
  id: string,
  repeat: RepeatRule | null,
): Promise<void> {
  await write(db, [
    {
      sql: "UPDATE tasks SET repeat_rule = ? WHERE entity_id = ?",
      params: [repeat ? JSON.stringify(repeat) : null, id],
    },
  ]);
}

const day = (date: Date) => date.toISOString().slice(0, 10);
const parseDay = (text: string | null) =>
  text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T00:00:00Z`) : null;

/// The day a repeat lands on after `from`. A month later on the 31st is the end of a
/// shorter month, as on the desktop.
export function nextAfter(rule: RepeatRule, from: Date): Date {
  const next = new Date(from);
  if (rule.unit === "day") next.setUTCDate(next.getUTCDate() + rule.every);
  else if (rule.unit === "week") next.setUTCDate(next.getUTCDate() + rule.every * 7);
  else {
    const target = from.getUTCMonth() + rule.every;
    next.setUTCDate(1);
    next.setUTCMonth(target);
    const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(from.getUTCDate(), last));
  }
  return next;
}

/// `update_task_status`: finishing stamps `completed_at` (kept while it stays
/// finished), reopening clears it. Finishing a repeating task as Done, the first
/// time, creates the next one: due a step later, start moved along, with its
/// effort, labels and links.
export async function setTaskStatus(
  db: LocalDb,
  id: string,
  statusId: string,
  today = new Date(),
): Promise<void> {
  const status = await first(db, "SELECT doneness FROM task_statuses WHERE id = ?", statusId);
  const task = await getTask(db, id);
  if (!status || !task) return;
  const finished = num(status.doneness) >= 100;
  const statements: SqlStatement[] = finished
    ? [
        {
          sql: "UPDATE tasks SET completed_at = CASE WHEN status_id = ? AND completed_at IS NOT NULL THEN completed_at ELSE ? END, status_id = ? WHERE entity_id = ?",
          params: [statusId, iso(db), statusId, id],
        },
      ]
    : [
        {
          sql: "UPDATE tasks SET status_id = ?, completed_at = NULL WHERE entity_id = ?",
          params: [statusId, id],
        },
      ];
  if (
    finished &&
    statusId !== "cancelled" &&
    task.completedAt === null &&
    task.repeat &&
    task.entity.type === "task"
  ) {
    statements.push(...(await nextOccurrence(db, task, task.repeat, today)));
  }
  await write(db, statements);
}

async function nextOccurrence(
  db: LocalDb,
  task: TaskRecord,
  rule: RepeatRule,
  today: Date,
): Promise<SqlStatement[]> {
  const oldDue = parseDay(task.dueDate);
  const due = nextAfter(
    rule,
    oldDue ?? new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())),
  );
  const oldStart = parseDay(task.startDate);
  const start = oldStart
    ? oldDue
      ? new Date(oldStart.getTime() + (due.getTime() - oldDue.getTime()))
      : nextAfter(rule, oldStart)
    : null;
  const next = createTaskStatements(
    db,
    task.entity.spaceId,
    task.entity.title,
    start ? day(start) : null,
    day(due),
  );
  const statements = [
    ...next.statements,
    {
      sql: "UPDATE tasks SET repeat_rule = ?, effort = ? WHERE entity_id = ?",
      params: [JSON.stringify(rule), task.effort, next.id],
    },
    {
      sql: "INSERT OR IGNORE INTO entity_labels (entity_id, label_id) SELECT ?, label_id FROM entity_labels WHERE entity_id = ?",
      params: [next.id, task.entity.id],
    },
  ];
  for (const link of await rows(
    db,
    "SELECT from_entity_id, to_entity_id FROM relationships WHERE relationship_type = 'relates-to' AND (from_entity_id = ? OR to_entity_id = ?)",
    task.entity.id,
    task.entity.id,
  )) {
    const from = str(link.from_entity_id) === task.entity.id ? next.id : str(link.from_entity_id);
    const to = str(link.from_entity_id) === task.entity.id ? str(link.to_entity_id) : next.id;
    statements.push({
      sql: "INSERT INTO relationships (id, from_entity_id, to_entity_id, relationship_type, created_at) VALUES (?, ?, ?, 'relates-to', ?)",
      params: [db.newId(), from, to, iso(db)],
    });
  }
  return statements;
}
