import { sharedSpaceId } from "@nookly/shared/api";
import { moduleForEntityType } from "@nookly/shared/modules";
import { syncedTable } from "@nookly/shared/schema";
import {
  type Change,
  EMPTY_RECORD,
  MAX_PULL_RECORDS,
  OWN_DATASET,
  type PullRequest,
  type PullResponse,
  type PulledDataset,
  type PushResult,
  type RecordState,
  type Role,
  type SyncRecord,
  changeProblem,
  findPushLosses,
  mergeRecords,
  shareDataset,
} from "@nookly/shared/sync";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { authUser, conflicts, records, shares, users } from "../db/schema.ts";
import type { Logger } from "../log.ts";
import type { Hub } from "./hub.ts";

/// The tables a shared entity brings along: its own row, and the rows that belong to
/// it and nothing else (a page's blocks, a task's dates and status). Relationships,
/// labels, Sub-tasks and its Space stay with the owner; a recipient never gets
/// anything that wasn't shared explicitly.
const SHARE_TABLES = ["entities", "blocks", "note_settings", "tasks"];
/// The fields of a shared entity's own row an editor may change.
const EDITOR_ENTITY_FIELDS = new Set(["title", "icon", "updated_at"]);
/// Fields of a shared entity that are the recipient's own: accepted from them but
/// never stored, so pinning a shared page stays on their side.
const RECIPIENT_OWN_FIELDS = new Set(["pinned", "hidden_at"]);
/// Clocks of the records the server makes up for recipients, older than any edit.
const SERVER_CLOCK = "0000000000000-000000-server";

type ShareRow = typeof shares.$inferSelect;
type StoredRow = typeof records.$inferSelect;

interface Access {
  dataset: string;
  ownerId: string;
  role: Role;
  share: ShareRow | null;
}

/// The Space a recipient sees an owner's shared pages in. It exists only for them.

const key = (table: string, pk: string) => `${table}\u0000${pk}`;

function stateOf(row: StoredRow): RecordState {
  return { fields: row.fields, clocks: row.clocks, deletedClock: row.deletedClock };
}

function sameState(a: RecordState, b: RecordState): boolean {
  return (
    a.deletedClock === b.deletedClock &&
    JSON.stringify(Object.entries(a.clocks).sort()) ===
      JSON.stringify(Object.entries(b.clocks).sort()) &&
    JSON.stringify(Object.entries(a.fields).sort()) ===
      JSON.stringify(Object.entries(b.fields).sort())
  );
}

/// The entity a record belongs to: from its own fields when they hold it, else what
/// the server already knows, else what the device said.
function scopeOf(change: Change, stored: StoredRow | undefined): string | null {
  const table = syncedTable(change.table);
  if (!table || table.scope.kind === "none") return null;
  if (table.scope.kind === "column") {
    const value = change.fields[table.scope.column];
    if (value !== undefined && value !== null) return String(value);
  }
  return stored?.scope ?? change.scope;
}

export class SyncService {
  private readonly db: Database;
  private readonly hub: Hub;
  private readonly log: Logger;

  constructor(db: Database, hub: Hub, log: Logger) {
    this.db = db;
    this.hub = hub;
    this.log = log;
  }

  /// Every dataset the account can sync: its own, and each share it accepted.
  async access(userId: string): Promise<Access[]> {
    const accepted = await this.db
      .select()
      .from(shares)
      .where(and(eq(shares.recipientId, userId), eq(shares.status, "accepted")));
    return [
      { dataset: OWN_DATASET, ownerId: userId, role: "owner", share: null },
      ...accepted.map((share) => ({
        dataset: shareDataset(share.id),
        ownerId: share.ownerId,
        role: share.role,
        share,
      })),
    ];
  }

  /// Whether a collaborator may write `change` into the owner's shared entity.
  private editorMay(change: Change, share: ShareRow, stored: StoredRow | undefined): boolean {
    if (!SHARE_TABLES.includes(change.table)) return false;
    if ((stored?.scope ?? scopeOf(change, stored)) !== share.entityId) return false;
    if (change.table === "entities") {
      if (change.pk !== share.entityId || !stored || change.deletedClock) return false;
      return Object.keys(change.fields).every(
        (f) => EDITOR_ENTITY_FIELDS.has(f) || RECIPIENT_OWN_FIELDS.has(f),
      );
    }
    const owner = change.fields.entity_id;
    return owner === undefined || owner === share.entityId;
  }

  async push(userId: string, changes: Change[]): Promise<PushResult[]> {
    const access = new Map((await this.access(userId)).map((a) => [a.dataset, a]));
    const results = new Map<number, PushResult>();
    const reject = (index: number, change: Change, reason: PushResult["reason"]) =>
      results.set(index, {
        dataset: change.dataset,
        table: change.table,
        pk: change.pk,
        status: "rejected",
        reason,
      });
    const byOwner = new Map<string, { index: number; change: Change; access: Access }[]>();
    changes.forEach((change, index) => {
      const target = access.get(change.dataset);
      if (!target) return reject(index, change, "unknown-dataset");
      if (changeProblem(change)) return reject(index, change, "invalid");
      if (target.role === "viewer") return reject(index, change, "forbidden");
      const list = byOwner.get(target.ownerId) ?? [];
      list.push({ index, change, access: target });
      byOwner.set(target.ownerId, list);
    });

    for (const ownerId of [...byOwner.keys()].sort()) {
      const items = byOwner.get(ownerId) ?? [];
      const touched = new Set<string>();
      await this.db.transaction(async (tx) => {
        // One push per account at a time, so sequence numbers follow commit order.
        const [owner] = await tx
          .select({ seq: users.syncSeq })
          .from(users)
          .where(eq(users.id, ownerId))
          .for("update");
        let seq = owner?.seq ?? 0;
        const keys = items.map(({ change }) => sql`(${change.table}, ${change.pk})`);
        const existing = await tx
          .select()
          .from(records)
          .where(
            and(
              eq(records.ownerId, ownerId),
              sql`(${records.tbl}, ${records.pk}) IN (${sql.join(keys, sql`, `)})`,
            ),
          );
        const stored = new Map(existing.map((r) => [key(r.tbl, r.pk), r]));
        for (const { index, change, access: target } of items) {
          const current = stored.get(key(change.table, change.pk));
          let incoming = change;
          if (target.share) {
            if (!this.editorMay(change, target.share, current)) {
              reject(index, change, "forbidden");
              continue;
            }
            if (change.table === "entities") {
              const fields = Object.fromEntries(
                Object.entries(change.fields).filter(([f]) => !RECIPIENT_OWN_FIELDS.has(f)),
              );
              const clocks = Object.fromEntries(
                Object.entries(change.clocks).filter(([f]) => !RECIPIENT_OWN_FIELDS.has(f)),
              );
              incoming = { ...change, fields, clocks };
            }
          }
          results.set(index, {
            dataset: change.dataset,
            table: change.table,
            pk: change.pk,
            status: "applied",
          });
          const before = current ? stateOf(current) : EMPTY_RECORD;
          const merged = mergeRecords(before, incoming);
          if (current && sameState(before, merged)) continue;
          const losses = findPushLosses(current ? before : null, incoming);
          if (losses.length > 0) {
            await tx.insert(conflicts).values(
              losses.map((loss) => ({
                ownerId,
                authorId: loss.side === "local" ? userId : null,
                tbl: change.table,
                pk: change.pk,
                field: loss.field,
                losingValue: loss.value,
                losingClock: loss.clock,
                winningClock: loss.winningClock,
              })),
            );
          }
          const scope = scopeOf(change, current);
          seq += 1;
          const row = {
            ownerId,
            tbl: change.table,
            pk: change.pk,
            scope,
            fields: merged.fields,
            clocks: merged.clocks,
            deletedClock: merged.deletedClock,
            seq,
            updatedAt: new Date(),
          };
          await tx
            .insert(records)
            .values(row)
            .onConflictDoUpdate({
              target: [records.ownerId, records.tbl, records.pk],
              set: {
                scope,
                fields: row.fields,
                clocks: row.clocks,
                deletedClock: row.deletedClock,
                seq,
                updatedAt: row.updatedAt,
              },
            });
          if (scope) touched.add(scope);
          stored.set(key(change.table, change.pk), { ...row });
        }
        await tx.update(users).set({ syncSeq: seq }).where(eq(users.id, ownerId));
      });
      await this.announce(ownerId, touched);
    }
    const rejected = [...results.values()].filter((r) => r.status === "rejected").length;
    if (rejected > 0) this.log.debug("push rejected changes", { rejected, total: changes.length });
    return changes.map(
      (change, index) =>
        results.get(index) ?? {
          dataset: change.dataset,
          table: change.table,
          pk: change.pk,
          status: "rejected",
          reason: "invalid",
        },
    );
  }

  /// Tells every device of the owner, and of everyone the touched entities are
  /// shared with, that there is something new.
  private async announce(ownerId: string, touched: Set<string>) {
    this.hub.notify(ownerId, { type: "changes", dataset: OWN_DATASET });
    if (touched.size === 0) return;
    const reached = await this.db
      .select({ id: shares.id, recipientId: shares.recipientId })
      .from(shares)
      .where(
        and(
          eq(shares.ownerId, ownerId),
          eq(shares.status, "accepted"),
          inArray(shares.entityId, [...touched]),
        ),
      );
    for (const share of reached) {
      if (share.recipientId)
        this.hub.notify(share.recipientId, { type: "changes", dataset: shareDataset(share.id) });
    }
  }

  async pull(userId: string, request: PullRequest): Promise<PullResponse> {
    const limit = Math.min(request.limit ?? MAX_PULL_RECORDS, MAX_PULL_RECORDS);
    const access = await this.access(userId);
    const known = new Set(access.map((a) => a.dataset));
    const removed = Object.keys(request.cursors).filter((d) => !known.has(d));
    const datasets: PulledDataset[] = [];
    for (const target of access) {
      const cursor = request.cursors[target.dataset] ?? 0;
      datasets.push(
        target.share
          ? await this.pullShare(target, target.share, cursor, limit)
          : await this.pullOwn(target, cursor, limit),
      );
    }
    return { datasets, removed };
  }

  private async pullOwn(target: Access, cursor: number, limit: number): Promise<PulledDataset> {
    const rows = await this.db
      .select()
      .from(records)
      .where(and(eq(records.ownerId, target.ownerId), gt(records.seq, cursor)))
      .orderBy(records.seq)
      .limit(limit + 1);
    return this.page(target, rows, cursor, limit, (r) => r);
  }

  private async pullShare(
    target: Access,
    share: ShareRow,
    cursor: number,
    limit: number,
  ): Promise<PulledDataset> {
    const rows = await this.db
      .select()
      .from(records)
      .where(
        and(
          eq(records.ownerId, share.ownerId),
          eq(records.scope, share.entityId),
          inArray(records.tbl, SHARE_TABLES),
          gt(records.seq, cursor),
        ),
      )
      .orderBy(records.seq)
      .limit(limit + 1);
    const space = sharedSpaceId(share.ownerId);
    const page = this.page(target, rows, cursor, limit, (record) =>
      record.table === "entities"
        ? { ...record, fields: { ...record.fields, space_id: space, pinned: 0, hidden_at: null } }
        : record,
    );
    if (cursor === 0) page.records.unshift(...(await this.sharedSpace(share)));
    page.records.unshift(...(await this.statusesOf(share.ownerId, page.records)));
    return page;
  }

  private page(
    target: Access,
    rows: StoredRow[],
    cursor: number,
    limit: number,
    adapt: (record: SyncRecord) => SyncRecord,
  ): PulledDataset {
    const kept = rows.slice(0, limit);
    return {
      dataset: target.dataset,
      role: target.role,
      records: kept.map((r) =>
        adapt({
          table: r.tbl,
          pk: r.pk,
          scope: r.scope,
          fields: r.fields,
          clocks: r.clocks,
          deletedClock: r.deletedClock,
          seq: r.seq,
        }),
      ),
      cursor: kept.at(-1)?.seq ?? cursor,
      hasMore: rows.length > limit,
    };
  }

  /// The statuses the tasks of a page of records are in, so a status the owner made
  /// arrives with the task. Only the statuses, nothing else of the owner's.
  private async statusesOf(ownerId: string, pulled: SyncRecord[]): Promise<SyncRecord[]> {
    const ids = [
      ...new Set(
        pulled.filter((r) => r.table === "tasks").map((r) => String(r.fields.status_id ?? "")),
      ),
    ].filter(Boolean);
    if (ids.length === 0) return [];
    const rows = await this.db
      .select()
      .from(records)
      .where(
        and(
          eq(records.ownerId, ownerId),
          eq(records.tbl, "task_statuses"),
          inArray(records.pk, ids),
        ),
      );
    return rows.map((r) => ({
      table: r.tbl,
      pk: r.pk,
      scope: null,
      fields: r.fields,
      clocks: r.clocks,
      deletedClock: r.deletedClock,
      seq: 0,
    }));
  }

  /// The Space a recipient's copy of a shared item lives in, with that item's module.
  private async sharedSpace(share: ShareRow): Promise<SyncRecord[]> {
    const [owner] = await this.db
      .select({ username: authUser.username, name: authUser.name })
      .from(authUser)
      .where(eq(authUser.id, share.ownerId));
    const id = sharedSpaceId(share.ownerId);
    const at = share.createdAt.toISOString();
    const stamp = (fields: Record<string, string | number | null>) =>
      Object.fromEntries(Object.keys(fields).map((f) => [f, SERVER_CLOCK]));
    const space = {
      id,
      name: `Shared by ${owner?.username ?? owner?.name ?? "someone"}`,
      icon: null,
      color: "#94a3b8",
      created_at: at,
      updated_at: at,
      position: 1000,
    };
    const moduleKey = moduleForEntityType(share.entityType) ?? "notes";
    const module = {
      space_id: id,
      module_key: moduleKey,
      added_at: at,
      position: 0,
      hidden_at: null,
    };
    return [
      {
        table: "spaces",
        pk: id,
        scope: null,
        fields: space,
        clocks: stamp(space),
        deletedClock: null,
        seq: 0,
      },
      {
        table: "space_modules",
        pk: JSON.stringify([id, moduleKey]),
        scope: null,
        fields: module,
        clocks: stamp(module),
        deletedClock: null,
        seq: 0,
      },
    ];
  }

  async conflicts(userId: string) {
    return this.db
      .select()
      .from(conflicts)
      .where(eq(conflicts.ownerId, userId))
      .orderBy(conflicts.createdAt)
      .limit(500);
  }

  /// The title and type of an owner's entity, if it exists and isn't deleted for good.
  /// The keys of `pks` the account's own data has no record of, alive or deleted.
  async missing(ownerId: string, table: string, pks: string[]): Promise<string[]> {
    if (pks.length === 0) return [];
    const found = await this.db
      .select({ pk: records.pk })
      .from(records)
      .where(and(eq(records.ownerId, ownerId), eq(records.tbl, table), inArray(records.pk, pks)));
    const have = new Set(found.map((r) => r.pk));
    return pks.filter((pk) => !have.has(pk));
  }

  async entity(ownerId: string, entityId: string): Promise<{ title: string; type: string } | null> {
    const [row] = await this.db
      .select({ fields: records.fields })
      .from(records)
      .where(
        and(eq(records.ownerId, ownerId), eq(records.tbl, "entities"), eq(records.pk, entityId)),
      );
    if (!row) return null;
    return { title: String(row.fields.title ?? ""), type: String(row.fields.type ?? "") };
  }
}
