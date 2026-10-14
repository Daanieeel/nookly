import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import * as Y from "yjs";
import { PAGE_SCHEMA_VERSION, attrsKey, pageBlocks, pageSchemaVersion } from "../blocks/index.ts";
import { type SqlDriver, type SqlStatement, run } from "./sql.ts";

/// Page bodies as live Yjs documents on a device (DECISIONS.md D6). Each page this
/// device opens while signed in gets a document, kept in `page_docs` so it opens and
/// edits offline, and connected to the server through Hocuspocus, all pages over one
/// socket. Edits made offline stay `pending` until the server has them; pages with
/// pending edits are sent in the background on reconnect, even when nobody opens
/// them again. The block rows follow each document on the device too (without
/// counting as edits of their own), so search and the CLI read current text offline.

export interface PageSession {
  entityId: string;
  doc: Y.Doc;
  provider: HocuspocusProvider;
  /// A document from a newer Nookly: shown, not edited.
  readOnly: boolean;
}

export interface PageDocsOptions {
  driver: SqlDriver;
  serverUrl: string;
  token: () => Promise<string | null>;
  /// The account that owns a page: the signed in one, or whoever shared it.
  ownerOf: (entityId: string) => Promise<string | null>;
  /// The device's block rows changed (search and mentions are rebuilt from them).
  onRows?: (entityId: string) => void;
  /// Builds the socket; the global `WebSocket` by default.
  webSocket?: typeof WebSocket;
  now?: () => number;
  /// How long after the last edit the device's copy and rows follow.
  saveDelayMs?: number;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

interface Entry {
  session: PageSession;
  users: number;
  timer: ReturnType<typeof setTimeout> | null;
  synced: Promise<void>;
}

export class PageDocs {
  private readonly options: PageDocsOptions;
  private readonly socket: HocuspocusProviderWebsocket;
  private readonly entries = new Map<string, Entry>();
  private closed = false;

  constructor(options: PageDocsOptions) {
    this.options = options;
    this.socket = new HocuspocusProviderWebsocket({
      url: `${options.serverUrl.replace(/^http/, "ws").replace(/\/+$/, "")}/v1/collab`,
      WebSocketPolyfill: options.webSocket,
      // Reconnects on its own with backoff; documents carry on offline meanwhile.
      maxAttempts: 0,
    });
  }

  private async loadLocal(entityId: string): Promise<Uint8Array | null> {
    const [row] = await this.options.driver.query(
      "SELECT state FROM page_docs WHERE entity_id = ?",
      [entityId],
    );
    return row ? fromBase64(String(row.state)) : null;
  }

  /// Saves the device's copy, marked pending while the server hasn't confirmed it.
  private async saveLocal(entry: Entry) {
    const { doc, provider, entityId } = entry.session;
    const pending = provider.unsyncedChanges > 0 || !provider.isSynced ? 1 : 0;
    await this.options.driver.batch([
      run(
        "INSERT INTO page_docs (entity_id, state, pending, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (entity_id) DO UPDATE SET state = excluded.state, pending = excluded.pending, updated_at = excluded.updated_at",
        entityId,
        toBase64(Y.encodeStateAsUpdate(doc)),
        pending,
        new Date(this.options.now?.() ?? Date.now()).toISOString(),
      ),
    ]);
    await this.materialize(entityId, doc);
  }

  private schedule(entry: Entry) {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      entry.timer = null;
      void this.saveLocal(entry);
    }, this.options.saveDelayMs ?? 400);
  }

  private connect(entityId: string, doc: Y.Doc, owner: string): Entry {
    let markSynced = () => {};
    const synced = new Promise<void>((resolve) => {
      markSynced = resolve;
    });
    const provider = new HocuspocusProvider({
      websocketProvider: this.socket,
      name: `${owner}:${entityId}`,
      document: doc,
      token: async () => (await this.options.token()) ?? "",
      onSynced: () => markSynced(),
    });
    provider.attach();
    const entry: Entry = {
      session: {
        entityId,
        doc,
        provider,
        readOnly: pageSchemaVersion(doc) > PAGE_SCHEMA_VERSION,
      },
      users: 0,
      timer: null,
      synced,
    };
    doc.on("update", () => this.schedule(entry));
    // Confirmed by the server: the copy is no longer pending.
    provider.on("unsyncedChanges", () => {
      if (provider.unsyncedChanges === 0) this.schedule(entry);
    });
    this.entries.set(entityId, entry);
    return entry;
  }

  /// The page's document, or null when it has none on this device and the server
  /// can't be reached in `waitMs`: the page then edits its rows as before.
  async open(entityId: string, waitMs = 4000): Promise<PageSession | null> {
    if (this.closed) return null;
    const existing = this.entries.get(entityId);
    if (existing) {
      existing.users += 1;
      return existing.session;
    }
    const owner = await this.options.ownerOf(entityId);
    if (!owner) return null;
    const doc = new Y.Doc();
    const local = await this.loadLocal(entityId);
    if (local) Y.applyUpdate(doc, local);
    const entry = this.connect(entityId, doc, owner);
    entry.users = 1;
    if (!local) {
      const ready = await Promise.race([
        entry.synced.then(() => true),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), waitMs)),
      ]);
      if (!ready) {
        this.drop(entityId);
        return null;
      }
      await this.saveLocal(entry);
    }
    entry.session.readOnly = pageSchemaVersion(doc) > PAGE_SCHEMA_VERSION;
    return entry.session;
  }

  private drop(entityId: string) {
    const entry = this.entries.get(entityId);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    entry.session.provider.destroy();
    entry.session.doc.destroy();
    this.entries.delete(entityId);
  }

  /// The editor is done with the page. The document stays connected until the
  /// server has every edit, then closes.
  release(entityId: string) {
    const entry = this.entries.get(entityId);
    if (!entry) return;
    entry.users -= 1;
    if (entry.users > 0) return;
    const close = async () => {
      if (entry.users > 0) return;
      if (entry.timer) {
        clearTimeout(entry.timer);
        entry.timer = null;
      }
      await this.saveLocal(entry);
      if (entry.session.provider.unsyncedChanges > 0) {
        setTimeout(() => void close(), 2000);
        return;
      }
      if (entry.users === 0) this.drop(entityId);
    };
    void close();
  }

  /// Sends pages edited offline that nobody has open, once the server can be
  /// reached. Returns how many still wait.
  async flushPending(): Promise<number> {
    const rows = await this.options.driver.query(
      "SELECT entity_id FROM page_docs WHERE pending = 1",
      [],
    );
    let waiting = 0;
    for (const row of rows) {
      const entityId = String(row.entity_id);
      if (this.entries.has(entityId)) continue;
      const session = await this.open(entityId, 3000);
      if (!session) {
        waiting += 1;
        continue;
      }
      const entry = this.entries.get(entityId);
      await entry?.synced;
      this.release(entityId);
    }
    return waiting;
  }

  /// Writes the document's blocks into this device's rows without marking them as
  /// edits: the server writes the same rows. A row with an edit of its own not yet
  /// sent (the CLI, an import) is left alone; that edit reaches the document
  /// through the server instead.
  async materialize(entityId: string, doc: Y.Doc) {
    const blocks = pageBlocks(doc);
    if (blocks.length === 0) return;
    const { driver } = this.options;
    // The page's own row hasn't synced here yet; its rows follow once it has.
    if ((await driver.query("SELECT 1 AS x FROM entities WHERE id = ?", [entityId])).length === 0)
      return;
    const current = await driver.query(
      "SELECT id, position, block_type, content, language, filename, attrs, created_at FROM blocks WHERE entity_id = ?",
      [entityId],
    );
    const dirty = new Map(
      (
        await driver.query(
          "SELECT pk, version FROM sync_dirty WHERE tbl = 'blocks' AND pk IN (SELECT id FROM blocks WHERE entity_id = ?)",
          [entityId],
        )
      ).map((r) => [String(r.pk), Number(r.version)]),
    );
    const enabled =
      (await driver.query("SELECT 1 AS on_ FROM sync_meta WHERE key = 'enabled'", [])).length > 0;
    const byId = new Map(current.map((r) => [String(r.id), r]));
    const now = new Date(this.options.now?.() ?? Date.now()).toISOString();
    const statements: SqlStatement[] = [];
    const touched: string[] = [];
    const seen = new Set<string>();
    for (const block of blocks) {
      if (seen.has(block.blockId) || dirty.has(block.blockId)) continue;
      seen.add(block.blockId);
      const row = byId.get(block.blockId);
      const isCode = block.blockType === "code";
      const attrs =
        attrsKey(block.attrs) === "[]"
          ? null
          : JSON.stringify(
              Object.fromEntries(
                Object.entries(block.attrs ?? {})
                  .filter(([, v]) => v !== "")
                  .sort(([a], [b]) => a.localeCompare(b)),
              ),
            );
      const next = {
        position: block.position,
        block_type: block.blockType,
        content: block.content,
        language: isCode ? (block.language ?? null) : null,
        filename: isCode ? (block.filename ?? null) : null,
        attrs,
      };
      if (row && Object.entries(next).every(([k, v]) => (row[k] ?? null) === v)) continue;
      statements.push(
        run(
          "INSERT INTO blocks (id, entity_id, position, block_type, content, language, filename, attrs, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET position = excluded.position, block_type = excluded.block_type, content = excluded.content, language = excluded.language, filename = excluded.filename, attrs = excluded.attrs, updated_at = excluded.updated_at",
          block.blockId,
          entityId,
          next.position,
          next.block_type,
          next.content,
          next.language,
          next.filename,
          next.attrs,
          row ? String(row.created_at) : now,
          now,
        ),
      );
      touched.push(block.blockId);
    }
    for (const [id] of byId) {
      if (seen.has(id) || dirty.has(id)) continue;
      statements.push(run("DELETE FROM blocks WHERE id = ?", id));
      touched.push(id);
    }
    if (statements.length === 0) return;
    // The triggers marked each written row once; those marks are not edits.
    if (enabled) {
      for (const id of touched) {
        statements.push(
          run("DELETE FROM sync_dirty WHERE tbl = 'blocks' AND pk = ? AND version = 1", id),
        );
      }
    }
    await driver.batch(statements);
    this.options.onRows?.(entityId);
  }

  /// Signing out: every document closes and the device's copies go, as they belong
  /// to the account. The rows stay, and are sent again on the next sign in.
  async close(clear: boolean) {
    this.closed = true;
    for (const entityId of [...this.entries.keys()]) this.drop(entityId);
    this.socket.destroy();
    if (clear) await this.options.driver.batch([run("DELETE FROM page_docs")]);
  }
}
