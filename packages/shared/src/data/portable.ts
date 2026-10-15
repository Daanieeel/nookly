import { z } from "zod";
import type { SqlValue } from "../schema.ts";
import { type LocalDb, first, num, optStr, rows, str } from "./db.ts";
import { createCard, createDeck, listCards } from "./study.ts";
import { listStatuses, listSubtasks } from "./tasks.ts";
import { getTask } from "./tasks.ts";

/// Nookly files: one page, task, deck or assignment as a JSON document the desktop reads
/// and writes (`db/page_json.rs`, `task_json.rs`, `deck_json.rs`, `assignment_json.rs`).
/// Nothing that belongs to one instance travels: ids, labels, links, the icon and the Space;
/// mentions become plain text, and blocks that point at a file or another item become a
/// paragraph with its name. The phone writes all four and reads decks.

const MENTION = /\[([^\]]*)\]\(mention:[a-zA-Z0-9-]+(?:#[a-zA-Z0-9_-]+)?\)/g;
const stripMentions = (text: string) => text.replace(MENTION, "$1");

const FILE_BLOCKS = ["image", "video", "audio", "file"];
const ENTITY_BLOCKS = ["entity_card", "bookmark"];

interface BlockJson {
  type: string;
  content: string;
  language: string | null;
  filename: string | null;
  attrs: Record<string, string>;
}

function readAttrs(raw: SqlValue | undefined): Record<string, string> {
  const text = z.string().min(1).safeParse(raw);
  if (!text.success) return {};
  try {
    const parsed = z.record(z.string(), z.string()).safeParse(JSON.parse(text.data));
    if (!parsed.success) return {};
    // Sorted, as the desktop writes them.
    return Object.fromEntries(
      Object.entries(parsed.data)
        .map(([key, value]): [string, string] => [key, stripMentions(value)])
        .sort(([a], [b]) => a.localeCompare(b)),
    );
  } catch {
    return {};
  }
}

async function exportBlocks(db: LocalDb, entityId: string): Promise<BlockJson[]> {
  const blocks = await rows(
    db,
    "SELECT block_type, content, language, filename, attrs FROM blocks WHERE entity_id = ? ORDER BY position, id",
    entityId,
  );
  return blocks.map((b) => {
    const type = str(b.block_type);
    const content = str(b.content);
    const paragraph = (text: string): BlockJson => ({
      type: "paragraph",
      content: text,
      language: null,
      filename: null,
      attrs: {},
    });
    if (FILE_BLOCKS.includes(type) || ENTITY_BLOCKS.includes(type)) {
      const trimmed = content.trim();
      // A media block can also hold a plain address, which any reader can open.
      if (/^https?:\/\//.test(trimmed)) {
        return {
          type,
          content: trimmed,
          language: null,
          filename: null,
          attrs: readAttrs(b.attrs),
        };
      }
      return paragraph(stripMentions(trimmed));
    }
    return {
      type,
      content: stripMentions(content),
      language: optStr(b.language),
      filename: optStr(b.filename),
      attrs: readAttrs(b.attrs),
    };
  });
}

/// The kinds of item that can be written as a Nookly file.
export const PORTABLE_TYPES = ["note", "jot", "task", "index_card_deck", "assignment"];

export function nooklyFileNoun(type: string): string {
  if (type === "note" || type === "jot") return "Page";
  if (type === "task") return "Task";
  if (type === "index_card_deck") return "Deck";
  if (type === "assignment") return "Assignment";
  return "File";
}

/// The item as the text of a Nookly file, pretty printed as the desktop writes it.
export async function exportNooklyFile(
  db: LocalDb,
  id: string,
): Promise<{ filename: string; text: string }> {
  const entity = await first(
    db,
    "SELECT type, title FROM entities WHERE id = ? AND deleted_at IS NULL",
    id,
  );
  if (!entity) throw new Error("This item isn't here anymore.");
  const type = str(entity.type);
  const title = str(entity.title);
  const file = async (): Promise<object> => {
    if (type === "note" || type === "jot") {
      return {
        format: "nookly-page",
        version: 1,
        kind: type,
        title,
        blocks: await exportBlocks(db, id),
      };
    }
    if (type === "index_card_deck") {
      return {
        format: "nookly-deck",
        version: 1,
        kind: "deck",
        title,
        cards: (await listCards(db, id)).map((c) => ({ front: c.front, back: c.back })),
      };
    }
    const statuses = await listStatuses(db);
    const status = (statusId: string) => {
      const found = statuses.find((s) => s.id === statusId);
      if (!found) throw new Error("A status of this task isn't in the list.");
      return { name: found.name, doneness: found.doneness };
    };
    if (type === "task") {
      const task = await getTask(db, id);
      if (!task) throw new Error("This task isn't here anymore.");
      const subtasks = [];
      for (const sub of (await listSubtasks(db, id)).filter((t) => !t.entity.deletedAt)) {
        subtasks.push({
          title: sub.entity.title,
          status: status(sub.statusId),
          startDate: sub.startDate,
          dueDate: sub.dueDate,
          effort: sub.effort,
          blocks: await exportBlocks(db, sub.entity.id),
        });
      }
      return {
        format: "nookly-task",
        version: 1,
        kind: "task",
        title,
        status: status(task.statusId),
        startDate: task.startDate,
        dueDate: task.dueDate,
        effort: task.effort,
        repeat: task.repeat,
        blocks: await exportBlocks(db, id),
        subtasks,
      };
    }
    if (type === "assignment") {
      const a = await first(
        db,
        `SELECT a.status, a.due_date, a.grade, a.weight, c.title AS course
         FROM assignments a LEFT JOIN relationships r ON r.from_entity_id = a.entity_id AND r.relationship_type = 'assignment-course'
         LEFT JOIN entities c ON c.id = r.to_entity_id WHERE a.entity_id = ?`,
        id,
      );
      if (!a) throw new Error("This assignment isn't here anymore.");
      return {
        format: "nookly-assignment",
        version: 1,
        kind: "assignment",
        title,
        course: optStr(a.course),
        status: str(a.status),
        dueDate: optStr(a.due_date),
        grade: a.grade === null ? null : num(a.grade),
        weight: a.weight === null ? null : num(a.weight),
        blocks: await exportBlocks(db, id),
      };
    }
    throw new Error(`A ${type.replace("_", " ")} can't be saved as a file.`);
  };
  const safe = title.replace(/[\\/:*?"<>|]/g, "").trim() || "Untitled";
  return { filename: `${safe}.nookly.json`, text: JSON.stringify(await file(), null, 2) };
}

const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

const deckFile = z
  .object({
    format: z.literal("nookly-deck"),
    version: z.literal(1),
    kind: z.literal("deck"),
    title: z.string(),
    cards: z.array(z.object({ front: z.string(), back: z.string() }).strict()),
  })
  .strict();

export interface DeckPreview {
  title: string;
  cards: number;
}

/// Reads a Nookly deck file without touching the data: size, JSON, format, version, then every
/// field strictly, so a typo never imports half a file.
export function readDeckFile(text: string): z.infer<typeof deckFile> {
  if (text.length > MAX_IMPORT_BYTES)
    throw new Error("This file is too large to import (the limit is 20 MB).");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("This is not a Nookly file.");
  }
  const found = z
    .object({ format: z.string().optional(), version: z.unknown().optional() })
    .safeParse(json);
  if (!found.success || found.data.format !== "nookly-deck") {
    throw new Error(
      `This is not a Nookly deck file (format "${found.success ? (found.data.format ?? "none") : "none"}").`,
    );
  }
  if (found.data.version !== 1) {
    throw new Error(
      `This deck file is version ${String(found.data.version ?? "unknown")}, and this version of Nookly reads version 1.`,
    );
  }
  const parsed = deckFile.safeParse(json);
  if (!parsed.success) throw new Error("This deck file is not valid.");
  parsed.data.cards.forEach((card, index) => {
    if (!card.front.trim() && !card.back.trim()) {
      throw new Error(`Card ${index + 1} is empty: it needs a front or a back.`);
    }
  });
  return parsed.data;
}

/// A new deck from a Nookly deck file: its cards as new ones, due now. Never changes an
/// existing deck.
export async function importDeckFile(db: LocalDb, spaceId: string, text: string): Promise<string> {
  const file = readDeckFile(text);
  const deck = await createDeck(db, spaceId, file.title);
  for (const card of file.cards) await createCard(db, deck, card.front, card.back);
  return deck;
}
