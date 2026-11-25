import * as Y from "yjs";
import { z } from "zod";
import type { SqlValue } from "../schema.ts";
import {
  type Block,
  type BlockType,
  BLOCK_FIELDS,
  type BlockFields,
  applyBlock,
  orderBlocks,
  rowFields,
  seedPage,
} from "../blocks/index.ts";
import type { SqlStatement } from "../sync/sql.ts";
import { type LocalDb, iso, rows, write } from "./db.ts";

/// A page edited with the page editor while it has no live document (offline and never
/// opened, a page made here that the server has not seen, an item's description): the
/// editor works on a document kept only on this device, made from the page's block rows,
/// and what changes is written back as rows, which sync like any edit.
///
/// Only what was edited is written, field by field: a block someone else changed meanwhile
/// (it arrived by sync) keeps their change unless this editor changed the same block.

/// What each block was when last read or written, by block id: the fields as rows hold them.
export type PageSnapshot = Map<string, BlockFields>;

async function blockRows(db: LocalDb, entityId: string): Promise<Block[]> {
  const found = await rows(
    db,
    "SELECT id, position, block_type, content, language, filename, attrs, created_at, updated_at FROM blocks WHERE entity_id = ? ORDER BY position",
    entityId,
  );
  return found.map((r) => ({
    id: String(r.id),
    entityId,
    position: Number(r.position),
    // SAFETY: the desktop's rules only ever store its own block types.
    blockType: String(r.block_type) as BlockType,
    content: String(r.content ?? ""),
    language: r.language === null || r.language === undefined ? null : String(r.language),
    filename: r.filename === null || r.filename === undefined ? null : String(r.filename),
    attrs: parseAttrs(r.attrs),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }));
}

const storedAttrs = z.record(z.string(), z.string().or(z.number()).or(z.boolean()));

function parseAttrs(raw: SqlValue | undefined): Record<string, string> {
  if (raw === null || raw === undefined || raw === "") return {};
  try {
    const parsed = storedAttrs.safeParse(JSON.parse(String(raw)));
    if (!parsed.success) return {};
    return Object.fromEntries(Object.entries(parsed.data).map(([k, v]) => [k, String(v)]));
  } catch {
    return {};
  }
}

/// A document of the page made from its rows, and what it holds.
export async function openRowsPage(
  db: LocalDb,
  entityId: string,
): Promise<{ doc: Y.Doc; snapshot: PageSnapshot }> {
  const doc = new Y.Doc();
  const blocks = await blockRows(db, entityId);
  // An empty page stays empty: the editor makes its own first line, and a second one here
  // would show as a stray empty line.
  if (blocks.length > 0) seedPage(doc, blocks);
  return { doc, snapshot: rowFields(doc) };
}

/// Whether `positions` puts the blocks it shares with `snapshot` in another order.
function movedSince(snapshot: PageSnapshot, positions: ReadonlyMap<string, number>): boolean {
  const now = [...snapshot]
    .sort(([, a], [, b]) => a.position - b.position)
    .flatMap(([id]) => positions.get(id) ?? []);
  return now.some((position, i) => i > 0 && position < (now[i - 1] ?? 0));
}

const positionsOf = (blocks: Iterable<[string, { position: number }]>) =>
  new Map([...blocks].map(([id, block]) => [id, block.position]));

const rowPositions = (blocks: Block[]) =>
  new Map(blocks.map((block) => [block.id, block.position]));

/// Moves the document's blocks into the order the rows were given elsewhere. Returns the
/// snapshot numbered to match, so that order is not written back as an edit of this one.
function followRowOrder(current: Block[], doc: Y.Doc, snapshot: PageSnapshot): PageSnapshot {
  orderBlocks(doc, rowPositions(current));
  const followed = new Map(snapshot);
  let position = 0;
  for (const id of rowFields(doc).keys()) {
    const fields = snapshot.get(id);
    if (fields) followed.set(id, { ...fields, position: position++ });
  }
  return followed;
}

/// Writes what the editor changed since `snapshot` as row edits: a new block is added, a
/// removed one deleted, and of a changed one only the fields that changed. An order the rows
/// were given elsewhere meanwhile is kept, unless this editor moved blocks itself. Returns
/// what the rows hold now.
export async function saveRowsPage(
  db: LocalDb,
  entityId: string,
  doc: Y.Doc,
  snapshot: PageSnapshot,
): Promise<PageSnapshot> {
  const current = await blockRows(db, entityId);
  const base =
    movedSince(snapshot, rowPositions(current)) &&
    !movedSince(snapshot, positionsOf(rowFields(doc)))
      ? followRowOrder(current, doc, snapshot)
      : snapshot;
  const next = rowFields(doc);
  const now = iso(db);
  const statements: SqlStatement[] = [];
  for (const [id, fields] of next) {
    const before = base.get(id);
    if (!before) {
      statements.push({
        sql: "INSERT INTO blocks (id, entity_id, position, block_type, content, language, filename, attrs, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING",
        params: [
          id,
          entityId,
          fields.position,
          fields.block_type,
          fields.content,
          fields.language,
          fields.filename,
          fields.attrs,
          now,
          now,
        ],
      });
      continue;
    }
    const changed = BLOCK_FIELDS.filter((name) => before[name] !== fields[name]);
    if (changed.length === 0) continue;
    statements.push({
      sql: `UPDATE blocks SET ${changed.map((name) => `${name} = ?`).join(", ")}, updated_at = ? WHERE id = ?`,
      params: [...changed.map((name) => fields[name]), now, id],
    });
  }
  for (const id of base.keys()) {
    if (!next.has(id)) statements.push({ sql: "DELETE FROM blocks WHERE id = ?", params: [id] });
  }
  if (statements.length === 0) return next;
  statements.push({
    sql: "UPDATE entities SET updated_at = ? WHERE id = ?",
    params: [now, entityId],
  });
  await write(db, statements);
  return next;
}

/// Brings blocks changed elsewhere (by sync) into the open document, for the blocks this
/// editor has not changed since `snapshot`; a block both changed keeps this editor's text,
/// and sync keeps the other as a conflict. Returns the snapshot with what was taken in.
export async function takeRowChanges(
  db: LocalDb,
  entityId: string,
  doc: Y.Doc,
  snapshot: PageSnapshot,
): Promise<PageSnapshot> {
  const current = await blockRows(db, entityId);
  const mine = rowFields(doc);
  const taken = new Map(snapshot);
  const fromRows = new Map(
    current.map((block) => {
      const scratch = new Y.Doc();
      seedPage(scratch, [block]);
      return [block.id, { block, fields: rowFields(scratch).get(block.id) }];
    }),
  );
  for (const [id, { block, fields }] of fromRows) {
    if (!fields) continue;
    const before = snapshot.get(id);
    const editedHere = before && JSON.stringify(before) !== JSON.stringify(mine.get(id));
    if (editedHere) continue;
    const same =
      before && BLOCK_FIELDS.every((name) => name === "position" || before[name] === fields[name]);
    if (same) continue;
    applyBlock(doc, id, block);
    taken.set(id, { ...fields, position: block.position });
  }
  for (const id of snapshot.keys()) {
    if (fromRows.has(id)) continue;
    const editedHere = JSON.stringify(snapshot.get(id)) !== JSON.stringify(mine.get(id));
    if (editedHere) continue;
    applyBlock(doc, id, null);
    taken.delete(id);
  }
  return movedSince(snapshot, rowPositions(current)) && !movedSince(snapshot, positionsOf(mine))
    ? followRowOrder(current, doc, taken)
    : taken;
}
