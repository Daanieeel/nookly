import type { ApiClient, DeviceInfo, SignUp, User } from "../api/index.ts";
import { userSchema } from "../api/schemas.ts";
import { SYNCED_TABLES } from "../schema.ts";
import { type BlobPlatform, type BlobProgress, BlobSync } from "./blobs.ts";
import {
  type AnyConflict,
  type ConflictView,
  describeConflict,
  mergeConflictLists,
} from "./conflict-view.ts";
import { PageDocs } from "./docs.ts";
import type { SqlValue } from "../schema.ts";
import { SyncClient, type SyncStatus } from "./client.ts";
import { type Conflict, SyncEngine } from "./engine.ts";
import { MAX_MISSING_KEYS } from "./protocol.ts";
import { AccountSettingsSync, type SettingsBridge } from "./settings.ts";
import { type SqlDriver, ident, pkSql, run } from "./sql.ts";
import { createStore } from "zustand/vanilla";

/// Sync on one device: which server and account, the engine on the device's
/// database and the client that keeps it in step, the files that go with the rows,
/// the settings that follow the account, and the first sync of a device that
/// already has data. The desktop and the mobile app both run this. Sync is
/// optional; nothing here runs until someone signs in.

/// The account calls sync needs; the shared `ApiClient` is one.
export type AccountApi = Pick<
  ApiClient,
  | "signUp"
  | "signIn"
  | "signOut"
  | "me"
  | "isSignedIn"
  | "syncTransport"
  | "missing"
  | "sessionToken"
  | "conflicts"
  | "reportConflict"
  | "resolveConflict"
  | "devices"
>;

export interface SyncRuntimeDeps<A extends AccountApi> {
  driver: SqlDriver;
  /// An API client for a server, told when the server signs this device out.
  connect: (serverUrl: string, onSignedOut: () => void) => A;
  device: DeviceInfo;
  /// Rebuilds what the device derives from synced rows (the desktop's search index).
  reindex?: (entityIds: string[]) => Promise<void>;
  newId?: () => string;
  /// Remote changes landed; views refresh.
  onApplied: () => void;
  /// A full backup of the device, made before a first sync sends anything. When it
  /// fails, nothing is sent. With `keep` it holds the only copy of something (data kept
  /// out of an account, changes that never reached it) and must never be cleaned up.
  backup?: (keep?: boolean) => Promise<{ path: string }>;
  /// How this device stores, hashes, uploads and downloads files.
  blobs?: (serverUrl: string, api: A) => BlobPlatform;
  /// The device's settings, for the ones that follow the account.
  settings?: SettingsBridge;
  now?: () => number;
}

/// A first sync of a device that already had data: everything here goes into the
/// account, carefully. Kept in `sync_meta`, so it carries on after a restart.
export interface MigrationState {
  phase: "backup" | "sending" | "checking" | "done" | "failed";
  /// Rows to send, counted when it started, and sent so far.
  items: number;
  itemsSent: number;
  files: number;
  filesSent: number;
  /// Where the backup made before anything was sent is.
  backupPath: string | null;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}

export interface SyncAccountState {
  serverUrl: string | null;
  user: User | null;
  status: SyncStatus;
  /// Set when the server signed this device out (a password reset, a removed session).
  signedOutReason: string | null;
  migration: MigrationState | null;
  files: BlobProgress | null;
}

const OFF: SyncStatus = {
  state: "off",
  pending: 0,
  conflicts: 0,
  parked: 0,
  lastSyncedAt: null,
  error: null,
  live: false,
  lastChangedAt: null,
};

/// What a sign in does with data already on the device: `add` (the default) sends it to
/// the account, `setAside` backs it up and clears it, so only the account's data shows.
export interface SignInOptions {
  localData?: "add" | "setAside";
}

export interface SignOutResult {
  /// Changes that had not reached the account when the device signed out.
  unsent: number;
  /// The backup made because of them.
  backupPath: string | null;
}

/// How long a sign out waits for the last changes to go out.
const LAST_SYNC_MS = 10_000;

const MIGRATION_KEY = "migration";
/// Which account's page documents the device's copies are (`claimPageCopies`).
const PAGES_ACCOUNT_KEY = "pages_account";
/// How often files are tried again while some wait after a failure.
const FILE_RETRY_MS = 5_000;

/// A server address without a trailing slash, so one server is one address.
export function normalizeServerUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export class SyncRuntime<A extends AccountApi = AccountApi> {
  readonly store = createStore<SyncAccountState>(() => ({
    serverUrl: null,
    user: null,
    status: OFF,
    signedOutReason: null,
    migration: null,
    files: null,
  }));
  readonly engine: SyncEngine;
  private readonly deps: SyncRuntimeDeps<A>;
  private readonly now: () => number;
  private api: A | null = null;
  private client: SyncClient | null = null;
  private blobs: BlobSync | null = null;
  private readonly settings: AccountSettingsSync | null;
  private stopSettings: (() => void) | null = null;
  private filesRunning: Promise<void> | null = null;
  private filesCounted = { uploaded: 0, downloaded: 0 };
  private docs: PageDocs | null = null;
  private flushing = false;
  private starting: Promise<void> | null = null;
  private closingDocs: Promise<void> = Promise.resolve();
  private filesTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(deps: SyncRuntimeDeps<A>) {
    this.deps = deps;
    this.now = deps.now ?? Date.now;
    this.engine = new SyncEngine({
      driver: deps.driver,
      afterApply: deps.reindex,
      newId: deps.newId,
    });
    this.settings = deps.settings
      ? new AccountSettingsSync({ driver: deps.driver, bridge: deps.settings, now: this.now })
      : null;
  }

  /// This device, as it names itself to the server and to other people's editors.
  get device(): DeviceInfo {
    return this.deps.device;
  }

  /// The account API while signed in, for sessions, sharing and the account itself.
  account(): A | null {
    return this.api;
  }

  private connect(serverUrl: string): A {
    const url = normalizeServerUrl(serverUrl);
    this.store.setState({ serverUrl: url });
    // A sync still running belongs to the session before this one: it must not outlive it,
    // or the new sign in would keep the old, ended session's sync.
    if (this.client) this.stop();
    const api = this.deps.connect(url, () => {
      // Only the current account's client speaks for this device.
      if (this.api === api) void this.signedOutByServer();
    });
    this.api = api;
    return api;
  }

  /// On launch: carries on with the saved sign in, if there is one.
  async restore(serverUrl: string | null): Promise<void> {
    if (!serverUrl) return;
    const api = this.connect(serverUrl);
    if (!(await api.isSignedIn())) return;
    try {
      const user = await api.me();
      this.store.setState({ user });
      await this.rememberUser(user);
    } catch {
      // The server ended this session while the device was closed: it is signed out, and
      // no sync starts for a session that is gone.
      if (!(await api.isSignedIn())) return;
      // Offline at launch: the account last seen here, so the device still says it is
      // signed in; sync starts anyway and catches up when the server is back.
      this.store.setState({ user: await this.rememberedUser() });
    }
    if (this.api !== api) return;
    await this.start().catch(() => {});
  }

  /// The signed in account, kept on the device while sync is on (sign out clears it with
  /// the rest of sync's own data).
  private async rememberUser(user: User) {
    await this.deps.driver.batch([
      run(
        "INSERT INTO sync_meta (key, value) VALUES ('user', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        JSON.stringify(user),
      ),
    ]);
  }

  private async rememberedUser(): Promise<User | null> {
    const raw = await this.meta("user");
    if (!raw) return null;
    try {
      const parsed = userSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  /// How many items are on this device and in no account: what a sign in has to ask
  /// about. Nothing once the device syncs.
  async localDataCount(): Promise<number> {
    if (await this.engine.isEnabled()) return 0;
    return this.engine.itemCount();
  }

  /// A device's own data that is to stay out of the account: backed up first, then
  /// cleared, so only the account's data shows. Without a backup nothing is cleared and
  /// the sign in is taken back.
  private async setLocalDataAside(api: A) {
    if (await this.engine.isEnabled()) return;
    try {
      if (!this.deps.backup) throw new Error("This device can't make a backup.");
      await this.deps.backup(true);
    } catch (error) {
      await api.signOut().catch(() => {});
      throw error;
    }
    await this.cleared(await this.engine.wipe());
  }

  /// The device's data went: what is derived from it and every view follow.
  private async cleared(entityIds: string[]) {
    if (entityIds.length > 0) await this.deps.reindex?.(entityIds).catch(() => {});
    this.deps.onApplied();
  }

  async signUp(serverUrl: string, input: SignUp, options: SignInOptions = {}): Promise<User> {
    const api = this.connect(serverUrl);
    const user = await api.signUp(input, this.deps.device);
    if (options.localData === "setAside") await this.setLocalDataAside(api);
    this.store.setState({ user, signedOutReason: null });
    await this.start().catch(() => {});
    await this.rememberUser(user);
    return user;
  }

  /// `identifier` is a username or an email address.
  async signIn(
    serverUrl: string,
    identifier: string,
    password: string,
    options: SignInOptions = {},
  ): Promise<User> {
    const api = this.connect(serverUrl);
    const user = await api.signIn(identifier, password, this.deps.device);
    if (options.localData === "setAside") await this.setLocalDataAside(api);
    this.store.setState({ user, signedOutReason: null });
    await this.start().catch(() => {});
    await this.rememberUser(user);
    return user;
  }

  /// Tries a first sync again after its backup failed.
  async retryFirstSync(): Promise<void> {
    await this.start();
  }

  private async meta(key: string): Promise<string | null> {
    const rows = await this.deps.driver.query("SELECT value FROM sync_meta WHERE key = ?", [key]);
    const value = rows[0]?.value;
    return value === undefined || value === null ? null : String(value);
  }

  private async saveMigration(migration: MigrationState) {
    this.store.setState({ migration });
    // The row only exists while sync is on; before that the state lives in memory.
    if (!(await this.engine.isEnabled())) return;
    await this.deps.driver.batch([
      run(
        "INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        MIGRATION_KEY,
        JSON.stringify(migration),
      ),
    ]);
  }

  private async loadMigration(): Promise<MigrationState | null> {
    const raw = await this.meta(MIGRATION_KEY);
    if (!raw) return null;
    try {
      // SAFETY: only `saveMigration` writes this key, with a `MigrationState`.
      return JSON.parse(raw) as MigrationState;
    } catch {
      return null;
    }
  }

  /// Backs the device up, then turns sync on, which marks every row as a change.
  /// Nothing reaches the server before the backup is safe.
  private async prepareFirstSync(serverUrl: string) {
    const startedAt = new Date(this.now()).toISOString();
    const base: MigrationState = {
      phase: "backup",
      items: 0,
      itemsSent: 0,
      files: 0,
      filesSent: 0,
      backupPath: null,
      startedAt,
      finishedAt: null,
      error: null,
    };
    this.store.setState({ migration: base });
    let backupPath: string | null = null;
    // A device with nothing on it has nothing to lose to a first sync.
    const [own] = await this.deps.driver.query(
      "SELECT (SELECT COUNT(*) FROM entities) + (SELECT COUNT(*) FROM spaces) AS n",
      [],
    );
    if (this.deps.backup && Number(own?.n ?? 0) > 0) {
      try {
        backupPath = (await this.deps.backup()).path;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.store.setState({
          migration: {
            ...base,
            phase: "failed",
            error: `Nookly couldn't back up this device first, so nothing was sent. ${reason}`,
          },
        });
        throw error;
      }
    }
    await this.settings?.seed();
    await this.engine.enable();
    const blobs = this.blobsFor(serverUrl);
    const files = blobs ? (await blobs.plan()).uploads.length : 0;
    await this.saveMigration({
      ...base,
      phase: "sending",
      items: await this.engine.pendingCount(),
      files,
      backupPath,
    });
  }

  private blobsFor(serverUrl: string): BlobSync | null {
    if (!this.deps.blobs || !this.api) return null;
    this.blobs ??= new BlobSync({
      driver: this.deps.driver,
      platform: this.deps.blobs(serverUrl, this.api),
      now: this.now,
    });
    return this.blobs;
  }

  /// One start at a time: two that overlap (a launch that restores twice) would each make
  /// a sync, and only one of them could ever be stopped.
  private start(): Promise<void> {
    const before = this.starting;
    const next = (async () => {
      await before?.catch(() => {});
      await this.startOnce();
    })();
    this.starting = next;
    void next
      .catch(() => {})
      .finally(() => {
        if (this.starting === next) this.starting = null;
      });
    return next;
  }

  private async startOnce() {
    const serverUrl = this.store.getState().serverUrl;
    const api = this.api;
    if (!api || this.client || !serverUrl) return;
    if (!(await this.engine.isEnabled())) await this.prepareFirstSync(serverUrl);
    else this.store.setState({ migration: await this.loadMigration() });
    this.blobsFor(serverUrl);
    if (this.settings && !this.stopSettings) {
      await this.settings.seed();
      this.stopSettings = this.settings.start();
    }
    await this.claimPageCopies(serverUrl);
    // Signed out or signed in elsewhere while this was getting ready.
    if (this.api !== api || this.client) return;
    this.client = new SyncClient({
      engine: this.engine,
      transport: api.syncTransport(),
      onStatus: (status) => this.store.setState({ status }),
      onApplied: this.deps.onApplied,
      afterCycle: (applied) => this.afterCycle(applied),
      countConflicts: () => this.openConflicts().then((all) => all.length),
    });
    await this.client.start();
  }

  /// The device's copies of page documents belong to one account on one server. Copies left
  /// from another one (a write that landed after a sign out, an older Nookly) must never
  /// meet this account's documents: two documents of the same page would merge into a page
  /// with its body twice. They are dropped before any page opens; the rows hold their text,
  /// and text that never reached a server goes as row edits.
  private async claimPageCopies(serverUrl: string) {
    const user = this.store.getState().user;
    if (!user) return;
    const account = `${serverUrl} ${user.id}`;
    if ((await this.meta(PAGES_ACCOUNT_KEY)) === account) return;
    await this.deps.driver.batch([
      run(
        "INSERT INTO sync_dirty (tbl, pk, changed_at) SELECT 'blocks', id, ? FROM blocks WHERE entity_id IN (SELECT entity_id FROM page_docs WHERE pending = 1) ON CONFLICT (tbl, pk) DO UPDATE SET version = version + 1",
        this.now(),
      ),
      run("DELETE FROM page_docs"),
      run(
        "INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        PAGES_ACCOUNT_KEY,
        account,
      ),
    ]);
  }

  /// Every conflict nobody decided on yet, from this device's log and the server's: two
  /// devices online that changed the same field at the same moment leave one only in the
  /// server's log, and it must still be offered.
  private async openConflicts(): Promise<AnyConflict[]> {
    let device = await this.engine.conflicts();
    let server: AnyConflict[] = [];
    if (this.api) {
      try {
        server = (await this.api.conflicts()).map((c) => ({ ...c, source: "server" as const }));
        if (await this.shareConflicts(this.api, device, server)) {
          device = await this.engine.conflicts();
        }
      } catch {
        // Offline: this device's own conflicts still count, and are handed over later.
      }
    }
    return mergeConflictLists(device, server);
  }

  /// A clash only this device saw (it pulled the other edit before sending its own) goes to
  /// the server, so every device offers it; one decided elsewhere is settled here, and one
  /// decided here while offline is settled on the server (DECISIONS.md D40). Nothing is
  /// deleted: both versions stay in both logs. True when this device's list changed.
  private async shareConflicts(api: A, device: Conflict[], server: Conflict[]) {
    const openOnServer = new Set(server.map((c) => c.id));
    const reports = new Map((await this.engine.conflictReports()).map((r) => [r.id, r]));
    let changed = false;
    for (const conflict of device) {
      // A removed row can only be put back where its copy is; it stays on this device.
      if (conflict.field === null || conflict.losingClock === null) continue;
      let serverId = reports.get(conflict.id)?.serverId;
      if (!serverId) {
        const reported = await api.reportConflict({
          table: conflict.table,
          pk: conflict.pk,
          field: conflict.field,
          losingValue: conflict.losingValue,
          losingClock: conflict.losingClock,
          winningClock: conflict.winningClock,
        });
        await this.engine.markConflictReported(conflict.id, reported.id);
        if (!reported.resolved) continue;
        serverId = reported.id;
      } else if (openOnServer.has(serverId)) continue;
      // Someone decided on it on another device; their choice arrives as an edit.
      await this.engine.dismissConflict(conflict.id);
      await this.engine.forgetConflictReport(conflict.id);
      changed = true;
    }
    for (const report of reports.values()) {
      if (report.open) continue;
      if (openOnServer.has(report.serverId)) await api.resolveConflict(report.serverId);
      await this.engine.forgetConflictReport(report.id);
    }
    return changed;
  }

  /// Every open conflict, described for the merge editor.
  async conflictViews(): Promise<ConflictView[]> {
    const all = await this.openConflicts();
    let names = new Map<string, string>();
    if (this.api) {
      try {
        names = new Map((await this.api.devices()).map((d) => [d.deviceId, d.name]));
      } catch {
        // Offline: devices without a name show as another device.
      }
    }
    const thisDeviceId = await this.engine.deviceId();
    return Promise.all(
      all.map((c) =>
        describeConflict(this.deps.driver, c, {
          thisDeviceId,
          thisDeviceName: this.deps.device.name.replace(/^Nookly on /, ""),
          names,
        }),
      ),
    );
  }

  /// Settles a conflict. Nothing is deleted: the other version stays in the log.
  /// - `current`: keep what shows now.
  /// - `other`: put the other version back.
  /// - `{ value }`: a version the person wrote, from either or both.
  async resolveConflict(view: ConflictView, choice: "current" | "other" | { value: SqlValue }) {
    if (view.kind === "removed") {
      if (choice === "other") await this.engine.restoreConflict(view.id);
      else await this.engine.dismissConflict(view.id);
      this.client?.notifyLocalChange();
      return;
    }
    const field = view.field;
    const value =
      choice === "current" ? view.current : choice === "other" ? view.other : choice.value;
    if (view.source === "device") {
      if (choice === "current") await this.engine.dismissConflict(view.id);
      else await this.engine.resolveConflict(view.id, value);
      // Handed to the server: settled there too, now or on the next sync.
      const report = (await this.engine.conflictReports()).find((r) => r.id === view.id);
      if (report && this.api) {
        try {
          await this.api.resolveConflict(report.serverId);
          await this.engine.forgetConflictReport(view.id);
        } catch {
          // Offline: the next sync settles it on the server.
        }
      }
    } else {
      if (field && choice !== "current")
        await this.engine.setField(view.table, view.pk, field, value);
      await this.api?.resolveConflict(view.id);
    }
    this.client?.notifyLocalChange();
  }

  /// Live page documents (DECISIONS.md D6), made on first use while signed in.
  pages(): PageDocs | null {
    const serverUrl = this.store.getState().serverUrl;
    const api = this.api;
    if (!api || !serverUrl || !this.client) return null;
    this.docs ??= new PageDocs({
      driver: this.deps.driver,
      serverUrl,
      token: () => api.sessionToken(),
      ownerOf: (entityId) => this.ownerOf(entityId),
      onRows: (entityId) => {
        void this.deps.reindex?.([entityId]);
        this.deps.onApplied();
      },
    });
    return this.docs;
  }

  /// Whose page this is: the signed in account's, or whoever shared it (a shared
  /// item sits in the Space `shared-<owner id>`).
  private async ownerOf(entityId: string): Promise<string | null> {
    const [row] = await this.deps.driver.query("SELECT space_id FROM entities WHERE id = ?", [
      entityId,
    ]);
    const space = row ? String(row.space_id) : null;
    if (space?.startsWith("shared-")) return space.slice("shared-".length);
    return this.store.getState().user?.id ?? null;
  }

  /// Sends pages edited offline in the background, once per sync at most.
  private flushPages() {
    if (this.flushing) return;
    this.flushing = true;
    void (async () => {
      try {
        const pending = await this.deps.driver.query(
          "SELECT 1 AS x FROM page_docs WHERE pending = 1 LIMIT 1",
          [],
        );
        if (pending.length > 0) await this.pages()?.flushPending();
      } catch {
        // Tried again after the next sync.
      } finally {
        this.flushing = false;
      }
    })();
  }

  private async afterCycle(applied: boolean) {
    if (applied && this.settings) {
      const changed = await this.settings.apply().catch(() => []);
      if (changed.length > 0) this.deps.onApplied();
    }
    this.runFiles();
    this.flushPages();
    await this.updateMigration().catch(() => {});
  }

  /// One pass over the files in the background; while some wait after a failure,
  /// another pass follows.
  private runFiles() {
    if (!this.blobs || this.filesRunning) return;
    const blobs = this.blobs;
    this.filesRunning = (async () => {
      try {
        const progress = await blobs.runOnce();
        this.store.setState({ files: progress });
        // The counts run for the whole session; only what this pass did is news.
        // Acting on the total would start another sync after every sync.
        const { uploaded, downloaded } = this.filesCounted;
        this.filesCounted = { uploaded: progress.uploaded, downloaded: progress.downloaded };
        if (progress.downloaded > downloaded) this.deps.onApplied();
        // A file that got its hash is a row change to send.
        if (progress.uploaded > uploaded) this.client?.notifyLocalChange();
        await this.updateMigration();
        if ((progress.waiting > 0 || progress.toDownload > 0) && this.client && !this.filesTimer) {
          this.filesTimer = setTimeout(() => {
            this.filesTimer = null;
            this.runFiles();
          }, FILE_RETRY_MS);
        }
      } catch (error) {
        const lastError = error instanceof Error ? error.message : String(error);
        const files = this.store.getState().files;
        this.store.setState({
          files: {
            ...(files ?? {
              toUpload: 0,
              uploaded: 0,
              toDownload: 0,
              downloaded: 0,
              waiting: 0,
              lastError: null,
            }),
            lastError,
          },
        });
      } finally {
        this.filesRunning = null;
      }
    })();
  }

  /// Waits for the files in flight, for tests and for a clean sign out.
  async settled(): Promise<void> {
    await this.client?.syncNow();
    while (this.filesRunning) await this.filesRunning;
  }

  /// Counts what the first sync sent, and checks with the server before calling it done.
  private async updateMigration() {
    const migration = this.store.getState().migration;
    if (!migration || (migration.phase !== "sending" && migration.phase !== "checking")) return;
    const pending = await this.engine.pendingCount();
    const filesLeft = this.blobs ? (await this.blobs.plan()).uploads.length : 0;
    const next: MigrationState = {
      ...migration,
      itemsSent: Math.max(0, Math.min(migration.items, migration.items - pending)),
      filesSent: Math.max(0, Math.min(migration.files, migration.files - filesLeft)),
    };
    if (pending > 0 || filesLeft > 0 || this.client?.current().state !== "idle") {
      await this.saveMigration({ ...next, phase: "sending" });
      return;
    }
    await this.saveMigration({ ...next, phase: "checking" });
    const missing = await this.verify();
    if (missing > 0) {
      await this.saveMigration({ ...next, phase: "sending" });
      this.client?.notifyLocalChange();
      return;
    }
    await this.saveMigration({
      ...next,
      itemsSent: next.items,
      filesSent: next.files,
      phase: "done",
      finishedAt: new Date(this.now()).toISOString(),
    });
  }

  /// Asks the server for every row of this device's own data. A row it doesn't
  /// have is marked to be sent again from scratch. Returns how many were missing.
  async verify(): Promise<number> {
    if (!this.api) return 0;
    let missing = 0;
    for (const table of SYNCED_TABLES) {
      const rows = await this.deps.driver.query(
        `SELECT ${pkSql(table)} AS pk FROM ${ident(table.name)} WHERE ${pkSql(table)} NOT IN (SELECT pk FROM sync_rows WHERE tbl = ? AND dataset <> 'own')`,
        [table.name],
      );
      const pks = rows.map((r) => String(r.pk));
      for (let i = 0; i < pks.length; i += MAX_MISSING_KEYS) {
        const lost = await this.api.missing(table.name, pks.slice(i, i + MAX_MISSING_KEYS));
        if (lost.length === 0) continue;
        missing += lost.length;
        const at = this.now();
        await this.deps.driver.batch(
          lost.flatMap((pk) => [
            run("DELETE FROM sync_rows WHERE tbl = ? AND pk = ?", table.name, pk),
            run(
              "INSERT INTO sync_dirty (tbl, pk, changed_at) VALUES (?, ?, ?) ON CONFLICT (tbl, pk) DO UPDATE SET version = version + 1",
              table.name,
              pk,
              at,
            ),
          ]),
        );
      }
    }
    return missing;
  }

  stop() {
    this.client?.stop();
    this.client = null;
    this.stopSettings?.();
    this.stopSettings = null;
    if (this.filesTimer) clearTimeout(this.filesTimer);
    this.filesTimer = null;
    this.blobs = null;
    this.filesCounted = { uploaded: 0, downloaded: 0 };
    const docs = this.docs;
    this.docs = null;
    if (docs) this.closingDocs = docs.close(false).catch(() => {});
  }

  syncNow(): Promise<void> {
    return this.client?.syncNow() ?? Promise.resolve();
  }

  notifyLocalChange() {
    this.client?.notifyLocalChange();
  }

  /// What on this device has not reached the account: row changes, typing in pages and
  /// files still to send.
  async unsentCount(): Promise<number> {
    if (!(await this.engine.isEnabled())) return 0;
    const rows = await this.engine.pendingCount();
    const [pages] = await this.deps.driver.query(
      "SELECT COUNT(*) AS n FROM page_docs WHERE pending = 1",
      [],
    );
    const files = this.blobs ? (await this.blobs.plan()).uploads.length : 0;
    return rows + Number(pages?.n ?? 0) + files;
  }

  /// Signs this device out and leaves it as a new one: its data stays in the account and
  /// on the other devices, not here. What has not reached the account is tried once more;
  /// if some still waits, the whole device is backed up first, and when that backup fails
  /// nothing happens at all. Returns how much was unsent and where its backup is.
  async signOut(): Promise<SignOutResult> {
    // Not signed in: there is no account holding this data, so nothing may be cleared.
    if (!this.store.getState().user) return { unsent: 0, backupPath: null };
    if (this.client) {
      await Promise.race([
        this.client.syncNow().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, LAST_SYNC_MS)),
      ]);
      await this.docs?.flushPending().catch(() => 0);
    }
    const unsent = await this.unsentCount();
    let backupPath: string | null = null;
    if (unsent > 0 && this.deps.backup) backupPath = (await this.deps.backup(true)).path;
    const client = this.client;
    this.stop();
    // A sync still on its way must not write after the wipe below.
    await client?.finished();
    // Open pages write their last words into the rows before their copies go.
    await this.closingDocs;
    try {
      await this.api?.signOut();
    } catch {
      // Offline: the server ends the session when it expires.
    }
    await this.engine.disable();
    const gone = await this.engine.wipe();
    this.store.setState({ user: null, status: OFF, migration: null, files: null });
    await this.cleared(gone);
    return { unsent, backupPath };
  }

  /// The account is gone from the server (deleted from this device): the device lets go of
  /// it and keeps every row, which is now the only copy.
  async detach(): Promise<void> {
    const client = this.client;
    this.stop();
    await client?.finished();
    await this.closingDocs;
    await this.api?.signOut().catch(() => {});
    await this.engine.disable();
    await this.deps.driver.batch([run("DELETE FROM page_docs")]);
    this.store.setState({ user: null, status: OFF, migration: null, files: null });
  }

  /// The server ended this device's session (signed out from another device, a password
  /// reset, an account or a server that is gone). The data stays here: the device can't
  /// tell a wanted sign out from a server that lost everything, and must never be the
  /// reason the last copy disappears. The next sign in asks what to do with it.
  private async signedOutByServer() {
    const client = this.client;
    this.stop();
    await client?.finished();
    await this.closingDocs;
    await this.engine.disable();
    await this.deps.driver.batch([run("DELETE FROM page_docs")]);
    this.store.setState({
      user: null,
      status: OFF,
      migration: null,
      files: null,
      signedOutReason: "This device was signed out of sync. Sign in again to keep syncing.",
    });
  }
}
