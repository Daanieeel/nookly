import { Hocuspocus } from "@hocuspocus/server";
import {
  type Block,
  type BlockType,
  applyBlock,
  pageBlocks,
  seedPage,
} from "@nookly/shared/blocks";
import { SHAREABLE_TYPES } from "@nookly/shared/api";
import { type Change, HybridClock, OWN_DATASET, isAlive } from "@nookly/shared/sync";
import { and, eq } from "drizzle-orm";
import * as Y from "yjs";
import { z } from "zod";
import type { AccountService } from "../auth/accounts.ts";
import type { Config } from "../config.ts";
import type { Database } from "../db/client.ts";
import { documents, records, shares } from "../db/schema.ts";
import type { Logger } from "../log.ts";
import type { ChangedBlock, SyncService } from "../sync/service.ts";

/// Who has a page open, and on whose data.
interface Context {
  userId: string;
  ownerId: string;
  entityId: string;
}

/// The block columns a row of `blocks` has, as stored in `records`.
type BlockFields = Record<string, string | number | null>;

const PAGE_TYPES = new Set(["note", "jot", "course_notes"]);

/// A document is named `<owner id>:<entity id>`: the same page is the same document
/// for its owner and for everyone it is shared with.
export const documentName = (ownerId: string, entityId: string) => `${ownerId}:${entityId}`;

function parseName(name: string): { ownerId: string; entityId: string } | null {
  const at = name.indexOf(":");
  if (at <= 0) return null;
  return { ownerId: name.slice(0, at), entityId: name.slice(at + 1) };
}

const attrsSchema = z.record(z.string(), z.string());

function parseAttrs(raw: string | number | null | undefined): Record<string, string> {
  try {
    const parsed = attrsSchema.safeParse(JSON.parse(String(raw ?? "{}")));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

function rowOf(fields: BlockFields, id: string): Block {
  const attrs = parseAttrs(fields.attrs);
  return {
    id,
    entityId: String(fields.entity_id ?? ""),
    position: Number(fields.position ?? 0),
    // SAFETY: rows of `blocks` only ever hold block types the desktop registered.
    blockType: String(fields.block_type ?? "paragraph") as BlockType,
    content: String(fields.content ?? ""),
    language:
      fields.language === null || fields.language === undefined ? null : String(fields.language),
    filename:
      fields.filename === null || fields.filename === undefined ? null : String(fields.filename),
    attrs,
    createdAt: String(fields.created_at ?? ""),
    updatedAt: String(fields.updated_at ?? ""),
  };
}

/// Stored form of a block's attrs: set ones only, keys in order, null when none.
function attrsText(attrs: Record<string, string> | undefined): string | null {
  const set = Object.entries(attrs ?? {})
    .filter(([, value]) => value !== "")
    .sort(([a], [b]) => a.localeCompare(b));
  return set.length > 0 ? JSON.stringify(Object.fromEntries(set)) : null;
}

/// Page bodies as Yjs documents, edited live through Hocuspocus (`/v1/collab`).
/// The server is the authority for a page: it seeds its document from the block
/// rows the first time anyone opens it, writes the rows back from the document
/// after edits (so search, the CLI and every other client keep reading rows), and
/// puts rows changed outside an editor into the document.
export class CollabService {
  readonly hocuspocus: Hocuspocus<Context>;
  private readonly db: Database;
  private readonly sync: SyncService;
  private readonly log: Logger;
  private readonly clock = new HybridClock("server");

  constructor(
    db: Database,
    sync: SyncService,
    accounts: AccountService,
    config: Config,
    log: Logger,
  ) {
    this.db = db;
    this.sync = sync;
    this.log = log;
    this.hocuspocus = new Hocuspocus<Context>({
      quiet: true,
      debounce: config.COLLAB_DEBOUNCE_MS,
      maxDebounce: config.COLLAB_MAX_DEBOUNCE_MS,
      onAuthenticate: async ({ token, documentName: name, connectionConfig }) => {
        const claims = await accounts.authenticate(token);
        const target = parseName(name);
        if (!target) throw new Error("No such page.");
        const role = await this.roleOf(claims.userId, target.ownerId, target.entityId);
        if (!role) throw new Error("No such page.");
        if (role === "viewer") connectionConfig.readOnly = true;
        return { userId: claims.userId, ...target } satisfies Context;
      },
      onLoadDocument: async ({ document, documentName: name }) => {
        const target = parseName(name);
        if (target) await this.load(target.ownerId, target.entityId, document);
        return document;
      },
      onStoreDocument: async ({ document, documentName: name }) => {
        const target = parseName(name);
        if (!target) return;
        try {
          await this.store(target.ownerId, target.entityId, document);
        } catch (error) {
          // The document is kept in memory and saved again on its next change.
          this.log.error("couldn't save a page document", {
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      },
    });
    sync.onBlocks = (ownerId, blocks) => this.applyRows(ownerId, blocks);
  }

  /// What the account may do with an owner's page: its own, or a page shared with
  /// it and accepted. Null when neither, or when it isn't a page.
  private async roleOf(userId: string, ownerId: string, entityId: string) {
    const [entity] = await this.db
      .select({ fields: records.fields, deleted: records.deletedClock, clocks: records.clocks })
      .from(records)
      .where(
        and(eq(records.ownerId, ownerId), eq(records.tbl, "entities"), eq(records.pk, entityId)),
      );
    if (!entity || !PAGE_TYPES.has(String(entity.fields.type))) return null;
    if (userId === ownerId) return "owner" as const;
    if (!SHAREABLE_TYPES.some((type) => type === entity.fields.type)) return null;
    const [share] = await this.db
      .select({ role: shares.role })
      .from(shares)
      .where(
        and(
          eq(shares.ownerId, ownerId),
          eq(shares.entityId, entityId),
          eq(shares.recipientId, userId),
          eq(shares.status, "accepted"),
        ),
      );
    return share?.role ?? null;
  }

  private async blockRows(ownerId: string, entityId: string) {
    const rows = await this.db
      .select()
      .from(records)
      .where(
        and(eq(records.ownerId, ownerId), eq(records.tbl, "blocks"), eq(records.scope, entityId)),
      );
    return rows;
  }

  /// The stored document, or a new one made from the page's rows (saved at once, so
  /// it is only ever made once).
  private async load(ownerId: string, entityId: string, doc: Y.Doc) {
    const [stored] = await this.db
      .select({ state: documents.state })
      .from(documents)
      .where(and(eq(documents.ownerId, ownerId), eq(documents.entityId, entityId)));
    if (stored) {
      Y.applyUpdate(doc, stored.state);
      return;
    }
    const alive = (await this.blockRows(ownerId, entityId)).filter((r) =>
      isAlive({ fields: r.fields, clocks: r.clocks, deletedClock: r.deletedClock }),
    );
    seedPage(
      doc,
      alive.map((r) => rowOf(r.fields, r.pk)),
    );
    await this.db
      .insert(documents)
      .values({ ownerId, entityId, state: Y.encodeStateAsUpdate(doc) })
      .onConflictDoNothing();
  }

  /// Saves the document, then writes its blocks as rows: changed fields get the
  /// server's clock, blocks gone from the document are deleted.
  private async store(ownerId: string, entityId: string, doc: Y.Doc) {
    await this.db
      .insert(documents)
      .values({ ownerId, entityId, state: Y.encodeStateAsUpdate(doc) })
      .onConflictDoUpdate({
        target: [documents.ownerId, documents.entityId],
        set: { state: Y.encodeStateAsUpdate(doc), updatedAt: new Date() },
      });
    const stored = new Map((await this.blockRows(ownerId, entityId)).map((r) => [r.pk, r]));
    const now = new Date().toISOString();
    const clock = this.clock.stamp(Date.now());
    const changes: Change[] = [];
    const seen = new Set<string>();
    for (const block of pageBlocks(doc)) {
      if (seen.has(block.blockId)) continue;
      seen.add(block.blockId);
      const current = stored.get(block.blockId);
      const alive =
        current &&
        isAlive({
          fields: current.fields,
          clocks: current.clocks,
          deletedClock: current.deletedClock,
        });
      const isCode = block.blockType === "code";
      const next = {
        id: block.blockId,
        entity_id: entityId,
        position: block.position,
        block_type: block.blockType,
        content: block.content,
        language: isCode ? (block.language ?? null) : null,
        filename: isCode ? (block.filename ?? null) : null,
        attrs: attrsText(block.attrs),
      } satisfies BlockFields;
      const fields: BlockFields = {};
      for (const [name, value] of Object.entries(next)) {
        if (!alive || current.fields[name] !== value) fields[name] = value;
      }
      if (Object.keys(fields).length === 0) continue;
      fields.updated_at = now;
      if (!alive) fields.created_at = current?.fields.created_at ?? now;
      changes.push(
        this.change(ownerId, entityId, block.blockId, fields, clock, current?.clocks ?? {}, null),
      );
    }
    for (const [pk, current] of stored) {
      if (seen.has(pk)) continue;
      if (
        !isAlive({
          fields: current.fields,
          clocks: current.clocks,
          deletedClock: current.deletedClock,
        })
      )
        continue;
      changes.push(this.change(ownerId, entityId, pk, {}, clock, current.clocks, clock));
    }
    if (changes.length === 0) return;
    await this.sync.commit(
      ownerId,
      changes.map((change, index) => ({ index, change, access: null })),
      null,
    );
  }

  private change(
    _ownerId: string,
    entityId: string,
    pk: string,
    fields: BlockFields,
    clock: string,
    baseClocks: Record<string, string>,
    deletedClock: string | null,
  ): Change {
    return {
      dataset: OWN_DATASET,
      table: "blocks",
      pk,
      scope: entityId,
      fields,
      clocks: Object.fromEntries(Object.keys(fields).map((name) => [name, clock])),
      baseClocks: Object.fromEntries(
        Object.keys(fields)
          .filter((name) => baseClocks[name] !== undefined)
          .map((name) => [name, baseClocks[name]]),
      ),
      deletedClock,
    };
  }

  /// Rows a device pushed (an older device, the CLI, an import) go into the page's
  /// document, if it has one: open documents through the live instance, stored ones
  /// directly. Pages that are still only rows are seeded from them later anyway.
  async applyRows(ownerId: string, blocks: ChangedBlock[]) {
    const byPage = new Map<string, ChangedBlock[]>();
    for (const block of blocks) {
      if (!block.scope) continue;
      byPage.set(block.scope, [...(byPage.get(block.scope) ?? []), block]);
    }
    for (const [entityId, changed] of byPage) {
      const apply = (doc: Y.Doc) => {
        for (const { pk, state } of changed) {
          applyBlock(doc, pk, isAlive(state) ? rowOf(state.fields, pk) : null);
        }
      };
      const name = documentName(ownerId, entityId);
      if (this.hocuspocus.documents.has(name)) {
        const connection = await this.hocuspocus.openDirectConnection(name);
        await connection.transact((doc) => apply(doc));
        await connection.disconnect();
        continue;
      }
      const [stored] = await this.db
        .select({ state: documents.state })
        .from(documents)
        .where(and(eq(documents.ownerId, ownerId), eq(documents.entityId, entityId)));
      if (!stored) continue;
      const doc = new Y.Doc();
      Y.applyUpdate(doc, stored.state);
      apply(doc);
      await this.db
        .update(documents)
        .set({ state: Y.encodeStateAsUpdate(doc), updatedAt: new Date() })
        .where(and(eq(documents.ownerId, ownerId), eq(documents.entityId, entityId)));
    }
  }

  /// Saves every document with edits still waiting, for a clean shutdown and tests.
  async flush() {
    this.hocuspocus.flushPendingStores();
    await Bun.sleep(20);
  }
}
